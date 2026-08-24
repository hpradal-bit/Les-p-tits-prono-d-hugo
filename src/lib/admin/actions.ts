"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyDefaultPredictionsForRound } from "@/lib/predictions/round-lock";
import {
  recomputeFixtures,
  recomputeRound,
  recomputeSeason,
  type RecomputeSummary,
} from "@/lib/scoring/persist";
import type { Uuid } from "@/lib/types";
import { loadSettings } from "@/lib/settings";
import { loadPublicKey, sendToUser } from "@/lib/push/send";
import { enqueue, type EnqueueOutcome } from "@/lib/push/notify";
import { scheduleFor } from "@/lib/push/schedule";
import { describeQuiet, readRules, rulesToRows, validateRules } from "@/lib/push/rules";
import { requireAdmin, AdminError } from "./auth";
import { logAdminAction, MissingReasonError, normalizeReason } from "./log";
import { adminFail, adminOk, type AdminActionState } from "./types";
import { currentSeasonId } from "./queries";
import { createSyncContext, syncCalendar, syncLive, syncStandings } from "@/lib/providers";

/**
 * Actions de l'espace admin.
 *
 * Deux règles tenues ici, sans exception :
 *   · aucune action n'écrit directement des points — elle corrige une donnée
 *     puis déclenche un recalcul ;
 *   · toute action écrit dans `admin_actions` avec une raison obligatoire.
 */

const resultSchema = z.object({
  fixtureId: z.string().uuid(),
  homeScore: z.coerce.number().int().min(0).max(200),
  awayScore: z.coerce.number().int().min(0).max(200),
  status: z.enum(["finished", "official"]),
  reason: z.string(),
});

/** Zod rend des tableaux éventuellement absents : on les rend exploitables. */
function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(error.flatten().fieldErrors).filter(
      (entry): entry is [string, string[]] => Array.isArray(entry[1]),
    ),
  );
}

function handle(error: unknown): AdminActionState {
  if (error instanceof MissingReasonError) {
    return adminFail("La raison est obligatoire.", { fieldErrors: { reason: [error.message] } });
  }
  if (error instanceof AdminError) return adminFail(error.message);
  console.error("[admin]", error);
  return adminFail("L'action a échoué. Réessaie dans un instant.");
}

/**
 * Saisie manuelle d'un résultat — le filet de sécurité du samedi soir.
 *
 * C'est ce qui rend l'application indépendante de toute API : sept scores à
 * taper prennent deux minutes, et les points tombent aussitôt.
 */
export async function recordResult(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = resultSchema.safeParse({
      fixtureId: formData.get("fixtureId"),
      homeScore: formData.get("homeScore"),
      awayScore: formData.get("awayScore"),
      status: formData.get("status"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return adminFail("Score invalide.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { fixtureId, homeScore, awayScore, status, reason } = parsed.data;
    const admin = createAdminClient();

    const { data: before, error: bErr } = await admin
      .from("fixtures")
      .select("id, round_id, home_score, away_score, status")
      .eq("id", fixtureId)
      .single();
    if (bErr) throw bErr;

    const { error: uErr } = await admin
      .from("fixtures")
      .update({
        home_score: homeScore,
        away_score: awayScore,
        status,
        data_source: "manual",
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", fixtureId);
    if (uErr) throw uErr;

    // Le résultat change : les points suivent, immédiatement et entièrement.
    const summary = await recomputeFixtures(admin, [fixtureId]);

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "fixture.result_recorded",
      entityType: "fixture",
      entityId: fixtureId,
      before: { home_score: before.home_score, away_score: before.away_score, status: before.status },
      after: { home_score: homeScore, away_score: awayScore, status },
      reason,
      event: { roundId: before.round_id, fixtureId },
    });

    revalidatePath("/admin/matchs");
    revalidatePath("/classement");
    revalidatePath(`/match/${fixtureId}`);

    return adminOk(
      summary.predictions === 0
        ? "Résultat enregistré. Aucun pronostic à scorer."
        : `Résultat enregistré. ${summary.predictions} pronostic${summary.predictions > 1 ? "s" : ""} recalculé${summary.predictions > 1 ? "s" : ""}, ${summary.points} point${summary.points > 1 ? "s" : ""} distribué${summary.points > 1 ? "s" : ""}${summary.exactScores > 0 ? `, ${summary.exactScores} score${summary.exactScores > 1 ? "s" : ""} exact${summary.exactScores > 1 ? "s" : ""} 👌` : ""}.`,
    );
  } catch (error) {
    return handle(error);
  }
}

const clearSchema = z.object({
  fixtureId: z.string().uuid(),
  reason: z.string(),
});

/** Annule un résultat saisi par erreur : les points reviennent en arrière. */
export async function clearResult(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = clearSchema.safeParse({
      fixtureId: formData.get("fixtureId"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) return adminFail("Match introuvable.");
    const { fixtureId, reason } = parsed.data;
    const admin = createAdminClient();

    const { data: before, error: bErr } = await admin
      .from("fixtures")
      .select("id, round_id, home_score, away_score, status")
      .eq("id", fixtureId).single();
    if (bErr) throw bErr;

    const { error: uErr } = await admin
      .from("fixtures")
      .update({ home_score: null, away_score: null, status: "scheduled" })
      .eq("id", fixtureId);
    if (uErr) throw uErr;

    const summary = await recomputeFixtures(admin, [fixtureId]);

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "fixture.status_forced",
      entityType: "fixture",
      entityId: fixtureId,
      before: { home_score: before.home_score, away_score: before.away_score, status: before.status },
      after: { home_score: null, away_score: null, status: "scheduled" },
      reason,
      event: { roundId: before.round_id, fixtureId },
    });

    revalidatePath("/admin/matchs");
    revalidatePath("/classement");
    return adminOk(`Résultat annulé. ${summary.cleared} ligne${summary.cleared > 1 ? "s" : ""} de points effacée${summary.cleared > 1 ? "s" : ""}.`);
  } catch (error) {
    return handle(error);
  }
}

const kickoffSchema = z.object({
  fixtureId: z.string().uuid(),
  kickoffAt: z.string().min(1),
  reason: z.string(),
});

/**
 * Changement d'horaire. Le verrouillage suit automatiquement : oublier ce
 * recalcul reviendrait à fermer les pronostics au mauvais moment.
 */
export async function changeKickoff(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = kickoffSchema.safeParse({
      fixtureId: formData.get("fixtureId"),
      kickoffAt: formData.get("kickoffAt"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) return adminFail("Horaire invalide.");
    const { fixtureId, kickoffAt, reason } = parsed.data;

    const kickoff = new Date(kickoffAt);
    if (Number.isNaN(kickoff.getTime())) {
      return adminFail("Horaire invalide.", { fieldErrors: { kickoffAt: ["Date illisible."] } });
    }

    const admin = createAdminClient();
    const { data: before, error: bErr } = await admin
      .from("fixtures").select("id, round_id, kickoff_at, locks_at").eq("id", fixtureId).single();
    if (bErr) throw bErr;

    const { data: setting } = await admin
      .from("app_settings").select("value").eq("key", "lock.minutes_before_kickoff").maybeSingle();
    const lockMinutes = Number(setting?.value ?? 120);
    const locksAt = new Date(kickoff.getTime() - lockMinutes * 60_000);

    const { error: uErr } = await admin
      .from("fixtures")
      .update({
        kickoff_at: kickoff.toISOString(),
        locks_at: locksAt.toISOString(),
        kickoff_confirmed: true,
      })
      .eq("id", fixtureId);
    if (uErr) throw uErr;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "fixture.kickoff_changed",
      entityType: "fixture",
      entityId: fixtureId,
      before: { kickoff_at: before.kickoff_at, locks_at: before.locks_at },
      after: { kickoff_at: kickoff.toISOString(), locks_at: locksAt.toISOString() },
      reason,
      event: { roundId: before.round_id, fixtureId },
    });

    revalidatePath("/admin/matchs");
    revalidatePath("/journee");
    return adminOk(`Horaire enregistré. Verrouillage recalculé à H-${lockMinutes} min.`);
  } catch (error) {
    return handle(error);
  }
}

const roundSchema = z.object({
  roundId: z.string().uuid(),
  reason: z.string(),
});

/**
 * Pose les pronostics par défaut sur une journée déjà verrouillée.
 *
 * C'est le filet si le planificateur n'a pas tourné. Rejouable : relancée deux
 * fois, l'opération ne crée rien de plus, elle ne peut donc pas doubler les
 * pronostics d'un joueur.
 */
export async function applyRoundDefaultsAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = roundSchema.safeParse({
      roundId: formData.get("roundId"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) return adminFail("Journée introuvable.");
    const { roundId, reason } = parsed.data;

    const admin = createAdminClient();
    const report = await applyDefaultPredictionsForRound(admin, roundId);

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "round.defaults_applied",
      entityType: "round",
      entityId: roundId,
      after: { ...report },
      reason,
      event: { roundId },
    });

    revalidatePath("/admin/matchs");
    revalidatePath("/classement");

    if (!report.defaultPredictionEnabled) {
      return adminFail("Le barème n'autorise pas le pronostic par défaut.");
    }
    if (report.lockedFixtures === 0) {
      return adminOk("Aucun match verrouillé sur cette journée : rien à poser.");
    }
    return adminOk(
      `${report.created} pronostic${report.created > 1 ? "s" : ""} par défaut posé${report.created > 1 ? "s" : ""} sur ${report.lockedFixtures} match${report.lockedFixtures > 1 ? "s" : ""}.`,
    );
  } catch (error) {
    return adminFail(error instanceof Error ? error.message : "Échec.");
  }
}

/** Relance le calcul de toute une journée. Idempotent : rejouable sans risque. */
export async function recomputeRoundAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = roundSchema.safeParse({
      roundId: formData.get("roundId"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) return adminFail("Journée introuvable.");
    const { roundId, reason } = parsed.data;

    const admin = createAdminClient();
    const summary = await recomputeRound(admin, roundId);

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "round.recomputed",
      entityType: "round",
      entityId: roundId,
      after: summary,
      reason,
      event: { roundId },
    });

    revalidatePath("/admin/matchs");
    revalidatePath("/classement");
    return adminOk(
      `${summary.fixtures} match${summary.fixtures > 1 ? "s" : ""} recalculé${summary.fixtures > 1 ? "s" : ""}, ${summary.predictions} pronostic${summary.predictions > 1 ? "s" : ""}, ${summary.points} point${summary.points > 1 ? "s" : ""}.`,
    );
  } catch (error) {
    return handle(error);
  }
}


/**
 * Barème.
 *
 * Toute modification demande une portée, parce que les deux réponses sont
 * légitimes et qu'on ne peut pas deviner laquelle l'admin veut :
 *
 *   · « toute la saison » — on corrige la version en cours sur place, puis on
 *     rejoue tout. `computeScore` étant pure, le classement obtenu est
 *     exactement celui qu'on aurait eu si le barème avait toujours été
 *     celui-là. C'est le bon choix quand on répare une erreur de réglage.
 *
 *   · « à partir de maintenant » — on clôt la version en cours et on en ouvre
 *     une nouvelle. Les matchs déjà verrouillés gardent leur barème, les
 *     suivants prennent le nouveau. C'est le bon choix quand on change les
 *     règles du jeu en cours de route : personne ne voit ses points d'octobre
 *     bouger en février.
 */

export type RulesetScope = "season" | "forward";

const scopeField = z.enum(["season", "forward"]);

interface CurrentRuleset {
  id: Uuid;
  seasonId: Uuid;
  version: number;
  rules: Record<string, unknown>;
}

async function currentRuleset(admin: SupabaseClient): Promise<CurrentRuleset> {
  const seasonId = await currentSeasonId(admin);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("scoring_rulesets")
    .select("id, version, rules")
    .eq("season_id", seasonId)
    .lte("effective_from", now)
    .or(`effective_to.is.null,effective_to.gt.${now}`)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return {
    id: data.id as Uuid,
    seasonId,
    version: data.version as number,
    rules: (data.rules ?? {}) as Record<string, unknown>,
  };
}

interface AppliedChange {
  /** Le barème effectivement modifié — nouveau ou existant selon la portée. */
  rulesetId: Uuid;
  version: number;
  /** Correspondance ancienne → nouvelle tranche, vide en portée « saison ». */
  bucketIds: Map<Uuid, Uuid>;
  /** Pronostics recollés sur les nouvelles tranches. */
  remapped: number;
}

/**
 * Ouvre la version suivante du barème et referme l'actuelle.
 *
 * Les tranches d'écart appartiennent à une version : la nouvelle reçoit sa
 * propre copie. Les pronostics déjà saisis sur des matchs **encore ouverts**
 * pointent alors vers des tranches périmées — on les recolle sur la tranche de
 * même rang. Sans ça, un joueur ayant pronostiqué avant le changement verrait
 * sa tranche ignorée au dépouillement.
 */
async function openNextVersion(
  admin: SupabaseClient,
  ctx: { userId: Uuid },
  current: CurrentRuleset,
  rules: Record<string, unknown>,
  label: string,
): Promise<AppliedChange> {
  const now = new Date().toISOString();

  const { data: latest, error: lErr } = await admin
    .from("scoring_rulesets")
    .select("version")
    .eq("season_id", current.seasonId)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (lErr) throw lErr;

  const version = (latest.version as number) + 1;

  const { data: created, error: cErr } = await admin
    .from("scoring_rulesets")
    .insert({
      season_id: current.seasonId,
      version,
      label: label.slice(0, 120),
      effective_from: now,
      rules,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (cErr) throw cErr;
  const rulesetId = created.id as Uuid;

  const { error: closeErr } = await admin
    .from("scoring_rulesets")
    .update({ effective_to: now })
    .eq("id", current.id);
  if (closeErr) throw closeErr;

  // --- Les tranches suivent la version ------------------------------------
  const { data: oldBuckets, error: bErr } = await admin
    .from("margin_buckets")
    .select("id, position, min_points, max_points, label")
    .eq("ruleset_id", current.id)
    .order("position");
  if (bErr) throw bErr;

  const bucketIds = new Map<Uuid, Uuid>();
  if ((oldBuckets ?? []).length > 0) {
    const { data: newBuckets, error: iErr } = await admin
      .from("margin_buckets")
      .insert(
        oldBuckets!.map((b) => ({
          ruleset_id: rulesetId,
          position: b.position,
          min_points: b.min_points,
          max_points: b.max_points,
          label: b.label,
        })),
      )
      .select("id, position");
    if (iErr) throw iErr;

    const newByPosition = new Map<number, Uuid>();
    for (const b of newBuckets ?? []) {
      newByPosition.set(b.position as number, b.id as Uuid);
    }
    for (const b of oldBuckets!) {
      const next = newByPosition.get(b.position as number);
      if (next) bucketIds.set(b.id as Uuid, next);
    }
  }

  // --- Recoller les pronostics des matchs encore ouverts -------------------
  let remapped = 0;
  if (bucketIds.size > 0) {
    const { data: rounds } = await admin
      .from("rounds").select("id").eq("season_id", current.seasonId);
    const roundIds = (rounds ?? []).map((r) => r.id as string);

    if (roundIds.length > 0) {
      const { data: openFixtures, error: fErr } = await admin
        .from("fixtures")
        .select("id")
        .in("round_id", roundIds)
        .gt("locks_at", now);
      if (fErr) throw fErr;

      const fixtureIds = (openFixtures ?? []).map((f) => f.id as string);
      if (fixtureIds.length > 0) {
        for (const [oldId, newId] of bucketIds) {
          const { data: moved, error: mErr } = await admin
            .from("predictions")
            .update({ margin_bucket_id: newId })
            .in("fixture_id", fixtureIds)
            .eq("margin_bucket_id", oldId)
            .select("id");
          if (mErr) throw mErr;
          remapped += (moved ?? []).length;
        }
      }
    }
  }

  return { rulesetId, version, bucketIds, remapped };
}

/**
 * Applique un changement de barème selon la portée demandée, puis rejoue la
 * saison.
 *
 * Le rejeu est lancé dans les deux cas, et c'est voulu : en portée « à partir
 * de maintenant » il ne bouge rien, puisque chaque match retrouve la version
 * qui s'appliquait à son verrouillage. Le vérifier coûte quelques requêtes et
 * garantit qu'aucun point n'est resté sur un barème périmé.
 */
async function applyRulesetChange(
  admin: SupabaseClient,
  ctx: { userId: Uuid },
  scope: RulesetScope,
  current: CurrentRuleset,
  patch: Record<string, unknown>,
  label: string,
): Promise<AppliedChange & { summary: RecomputeSummary }> {
  const rules = { ...current.rules, ...patch };

  let applied: AppliedChange;
  if (scope === "forward") {
    applied = await openNextVersion(admin, ctx, current, rules, label);
  } else {
    const { error } = await admin
      .from("scoring_rulesets").update({ rules }).eq("id", current.id);
    if (error) throw error;
    applied = {
      rulesetId: current.id,
      version: current.version,
      bucketIds: new Map(),
      remapped: 0,
    };
  }

  const summary = await recomputeSeason(admin, current.seasonId);
  return { ...applied, summary };
}

/** Un barème touche tous les écrans qui affichent des points. */
function revalidatePathsAfterRuleset(): void {
  for (const path of ["/admin/bareme", "/regles", "/journee", "/classement"]) {
    revalidatePath(path);
  }
}

/** Un joueur ou un ajustement touche le classement et le vestiaire. */
function revalidatePathsAfterPlayer(): void {
  for (const path of ["/admin/joueurs", "/classement", "/vestiaire", "/profil"]) {
    revalidatePath(path);
  }
}

/** Ce que le changement a produit, dit à l'admin dans ses mots. */
function outcomeSentence(
  scope: RulesetScope,
  applied: { version: number; remapped: number; summary: RecomputeSummary },
): string {
  if (scope === "forward") {
    const remapped =
      applied.remapped > 0
        ? ` ${applied.remapped} pronostic${applied.remapped > 1 ? "s" : ""} en cours recollé${applied.remapped > 1 ? "s" : ""} sur les nouvelles tranches.`
        : "";
    return `Version ${applied.version} ouverte : les matchs déjà verrouillés gardent l'ancien barème.${remapped}`;
  }
  const { predictions, points } = applied.summary;
  if (predictions === 0) return "Aucun pronostic à recalculer pour l'instant.";
  return `Saison rejouée : ${predictions} pronostic${predictions > 1 ? "s" : ""}, ${points} point${points > 1 ? "s" : ""} au total.`;
}

const pointsSchema = z.object({
  wrong: z.coerce.number().int().min(0).max(999),
  winner: z.coerce.number().int().min(0).max(999),
  winnerAndMargin: z.coerce.number().int().min(0).max(999),
  exactScore: z.coerce.number().int().min(0).max(999),
  scope: scopeField,
  reason: z.string(),
});

/** Les quatre valeurs de la cascade. */
export async function updatePoints(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = pointsSchema.safeParse({
      wrong: formData.get("wrong"),
      winner: formData.get("winner"),
      winnerAndMargin: formData.get("winnerAndMargin"),
      exactScore: formData.get("exactScore"),
      scope: formData.get("scope"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return adminFail("Valeurs invalides.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { wrong, winner, winnerAndMargin, exactScore, scope, reason } = parsed.data;

    // La cascade doit rester croissante, sinon viser juste ferait perdre des points.
    if (!(wrong <= winner && winner <= winnerAndMargin && winnerAndMargin <= exactScore)) {
      return adminFail(
        "La cascade doit être croissante : mauvais ≤ vainqueur ≤ vainqueur + tranche ≤ score exact.",
      );
    }

    const admin = createAdminClient();
    const rs = await currentRuleset(admin);
    const points = {
      wrong,
      winner,
      winner_and_margin: winnerAndMargin,
      exact_score: exactScore,
    };

    const applied = await applyRulesetChange(admin, ctx, scope, rs, { points }, reason);

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: scope === "forward" ? "ruleset.version_created" : "ruleset.points_changed",
      entityType: "scoring_ruleset",
      entityId: applied.rulesetId,
      before: { points: rs.rules.points, version: rs.version },
      after: { points, version: applied.version },
      reason,
    });

    revalidatePathsAfterRuleset();
    return adminOk(`Barème enregistré. ${outcomeSentence(scope, applied)}`);
  } catch (error) {
    return handle(error);
  }
}

const lockSchema = z.object({
  minutesBeforeKickoff: z.coerce.number().int().min(0).max(10_080),
  reason: z.string(),
});

/**
 * Délai de verrouillage. Pas de portée à choisir ici : le délai ne décide
 * d'aucun point, seulement de l'heure de fermeture des pronostics à venir. Les
 * matchs déjà programmés portent leur propre `locks_at`, calculé à leur
 * création : on les recalcule tous, sauf ceux déjà verrouillés — rouvrir un
 * match fermé laisserait pronostiquer un résultat connu.
 */
export async function updateLockDelay(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = lockSchema.safeParse({
      minutesBeforeKickoff: formData.get("minutesBeforeKickoff"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return adminFail("Délai invalide.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { minutesBeforeKickoff, reason } = parsed.data;

    const admin = createAdminClient();
    const rs = await currentRuleset(admin);
    const before = { lock: rs.rules.lock };
    const lock = { minutes_before_kickoff: minutesBeforeKickoff };

    const { error: pErr } = await admin
      .from("scoring_rulesets")
      .update({ rules: { ...rs.rules, lock } })
      .eq("id", rs.id);
    if (pErr) throw pErr;

    // Le réglage lu par le reste du serveur suit la même valeur.
    const { error: sErr } = await admin
      .from("app_settings")
      .upsert(
        { key: "lock.minutes_before_kickoff", value: minutesBeforeKickoff },
        { onConflict: "key" },
      );
    if (sErr) throw sErr;

    const now = new Date();
    const { data: rounds } = await admin
      .from("rounds").select("id").eq("season_id", rs.seasonId);
    const roundIds = (rounds ?? []).map((r) => r.id as string);

    let retimed = 0;
    if (roundIds.length > 0) {
      const { data: fixtures, error: fErr } = await admin
        .from("fixtures")
        .select("id, kickoff_at, locks_at")
        .in("round_id", roundIds)
        .gt("kickoff_at", now.toISOString());
      if (fErr) throw fErr;

      for (const f of fixtures ?? []) {
        const kickoff = new Date(f.kickoff_at as string);
        const locksAt = new Date(kickoff.getTime() - minutesBeforeKickoff * 60_000);
        // Un match déjà verrouillé ne se rouvre pas.
        if (new Date(f.locks_at as string) <= now && locksAt > now) continue;
        if (locksAt.toISOString() === f.locks_at) continue;
        const { error: uErr } = await admin
          .from("fixtures").update({ locks_at: locksAt.toISOString() }).eq("id", f.id);
        if (uErr) throw uErr;
        retimed += 1;
      }
    }

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "ruleset.lock_changed",
      entityType: "scoring_ruleset",
      entityId: rs.id,
      before,
      after: { lock, fixtures_retimed: retimed },
      reason,
    });

    revalidatePathsAfterRuleset();
    return adminOk(
      `Verrouillage à H-${minutesBeforeKickoff} min. ${retimed} match${retimed > 1 ? "s" : ""} reprogrammé${retimed > 1 ? "s" : ""}.`,
    );
  } catch (error) {
    return handle(error);
  }
}

const exactScoreSchema = z.object({
  quota: z.string(),
  period: z.enum(["match", "round", "month", "season"]),
  scope: scopeField,
  reason: z.string(),
});

/** Quota de scores exacts : combien de tentatives, sur quelle période. */
export async function updateExactScoreQuota(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = exactScoreSchema.safeParse({
      quota: formData.get("quota"),
      period: formData.get("period"),
      scope: formData.get("scope"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return adminFail("Quota invalide.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { quota: rawQuota, period, scope, reason } = parsed.data;

    // Champ vide = illimité. On le distingue de zéro, qui interdit tout.
    const quota = rawQuota.trim() === "" ? null : Number(rawQuota);
    if (quota !== null && (!Number.isInteger(quota) || quota < 0 || quota > 99)) {
      return adminFail("Quota invalide.", {
        fieldErrors: { quota: ["Un entier entre 0 et 99, ou vide pour illimité."] },
      });
    }

    const admin = createAdminClient();
    const rs = await currentRuleset(admin);
    const previous = (rs.rules.exact_score ?? {}) as Record<string, unknown>;
    const exact = { ...previous, quota, period };

    const applied = await applyRulesetChange(
      admin, ctx, scope, rs, { exact_score: exact }, reason,
    );

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: scope === "forward" ? "ruleset.version_created" : "ruleset.exact_score_changed",
      entityType: "scoring_ruleset",
      entityId: applied.rulesetId,
      before: { exact_score: previous, version: rs.version },
      after: { exact_score: exact, version: applied.version },
      reason,
    });

    revalidatePathsAfterRuleset();
    return adminOk(`Quota enregistré. ${outcomeSentence(scope, applied)}`);
  } catch (error) {
    return handle(error);
  }
}

const bucketSchema = z.object({
  bucketId: z.string().uuid(),
  label: z.string().trim().min(1).max(40),
  minPoints: z.coerce.number().int().min(0).max(200),
  maxPoints: z.string(),
  scope: scopeField,
  reason: z.string(),
});

/** Renomme et reborne une tranche d'écart. */
export async function updateMarginBucket(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = bucketSchema.safeParse({
      bucketId: formData.get("bucketId"),
      label: formData.get("label"),
      minPoints: formData.get("minPoints"),
      maxPoints: formData.get("maxPoints"),
      scope: formData.get("scope"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return adminFail("Tranche invalide.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { bucketId, label, minPoints, maxPoints: rawMax, scope, reason } = parsed.data;

    // Champ vide = borne haute ouverte (la dernière tranche, « 41 et + »).
    const maxPoints = rawMax.trim() === "" ? null : Number(rawMax);
    if (maxPoints !== null && (!Number.isInteger(maxPoints) || maxPoints < minPoints)) {
      return adminFail("Tranche invalide.", {
        fieldErrors: { maxPoints: ["Doit être vide, ou supérieur ou égal au minimum."] },
      });
    }

    const admin = createAdminClient();
    const rs = await currentRuleset(admin);

    const { data: before, error: bErr } = await admin
      .from("margin_buckets")
      .select("id, ruleset_id, label, min_points, max_points")
      .eq("id", bucketId)
      .single();
    if (bErr) throw bErr;
    if (before.ruleset_id !== rs.id) {
      return adminFail("Cette tranche appartient à une version périmée du barème.");
    }

    // La version suivante emporte une copie des tranches : on modifie la copie,
    // pas l'originale, sinon les matchs déjà joués changeraient de barème.
    const applied =
      scope === "forward"
        ? await openNextVersion(admin, ctx, rs, rs.rules, reason)
        : {
            rulesetId: rs.id,
            version: rs.version,
            bucketIds: new Map<Uuid, Uuid>(),
            remapped: 0,
          };

    const targetId = applied.bucketIds.get(bucketId as Uuid) ?? bucketId;

    const { error: uErr } = await admin
      .from("margin_buckets")
      .update({ label, min_points: minPoints, max_points: maxPoints })
      .eq("id", targetId);
    if (uErr) throw uErr;

    const summary = await recomputeSeason(admin, rs.seasonId);

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "ruleset.margin_bucket_changed",
      entityType: "margin_bucket",
      entityId: targetId,
      before: { label: before.label, min_points: before.min_points, max_points: before.max_points },
      after: { label, min_points: minPoints, max_points: maxPoints, version: applied.version },
      reason,
    });

    revalidatePathsAfterRuleset();
    return adminOk(
      `Tranche « ${label} » enregistrée. ${outcomeSentence(scope, { ...applied, summary })}`,
    );
  } catch (error) {
    return handle(error);
  }
}

/* ---------------------------------------------------------------------------
   Joueurs et ajustements de points.

   Un ajustement n'écrase jamais un score calculé : il vit dans sa propre
   table, s'additionne au classement, et s'annule par un ajustement inverse
   plutôt que par une suppression. L'histoire du groupe reste lisible.
   --------------------------------------------------------------------------- */

const playerStateSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.enum(["true", "false"]).transform((v) => v === "true"),
  reason: z.string(),
});

/**
 * Active ou désactive un joueur.
 *
 * Désactiver le sort du classement et des rappels, mais ne supprime rien :
 * ses pronostics et ses points restent en base, et le réactiver les rend.
 */
export async function setPlayerActive(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = playerStateSchema.safeParse({
      userId: formData.get("userId"),
      isActive: formData.get("isActive"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) return adminFail("Joueur introuvable.");
    const { userId, isActive, reason } = parsed.data;

    const admin = createAdminClient();
    const { data: before, error: bErr } = await admin
      .from("profiles").select("id, display_name, is_active").eq("id", userId).single();
    if (bErr) throw bErr;

    const { error: uErr } = await admin
      .from("profiles").update({ is_active: isActive }).eq("id", userId);
    if (uErr) throw uErr;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: isActive ? "player.reactivated" : "player.deactivated",
      entityType: "profile",
      entityId: userId,
      before: { is_active: before.is_active },
      after: { is_active: isActive },
      reason,
    });

    revalidatePathsAfterPlayer();
    return adminOk(
      `${before.display_name} ${isActive ? "est de retour dans le classement" : "ne compte plus dans le classement"}.`,
    );
  } catch (error) {
    return handle(error);
  }
}

const playerRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "player"]),
  reason: z.string(),
});

/** Promeut ou rétrograde un joueur. Le dernier admin ne peut pas se démettre. */
export async function setPlayerRole(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = playerRoleSchema.safeParse({
      userId: formData.get("userId"),
      role: formData.get("role"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) return adminFail("Rôle invalide.");
    const { userId, role, reason } = parsed.data;

    const admin = createAdminClient();
    const { data: before, error: bErr } = await admin
      .from("group_members")
      .select("group_id, user_id, role")
      .eq("user_id", userId)
      .single();
    if (bErr) throw bErr;

    // Retirer le dernier administrateur fermerait l'espace admin pour tout le monde.
    if (before.role === "admin" && role === "player") {
      const { count, error: cErr } = await admin
        .from("group_members")
        .select("user_id", { count: "exact", head: true })
        .eq("group_id", before.group_id)
        .eq("role", "admin");
      if (cErr) throw cErr;
      if ((count ?? 0) <= 1) {
        return adminFail("Impossible : il n'y aurait plus aucun administrateur.");
      }
    }

    const { error: uErr } = await admin
      .from("group_members")
      .update({ role })
      .eq("group_id", before.group_id)
      .eq("user_id", userId);
    if (uErr) throw uErr;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "player.role_changed",
      entityType: "profile",
      entityId: userId,
      before: { role: before.role },
      after: { role },
      reason,
    });

    revalidatePathsAfterPlayer();
    return adminOk(role === "admin" ? "Joueur promu administrateur." : "Joueur redevenu simple joueur.");
  } catch (error) {
    return handle(error);
  }
}

const adjustmentSchema = z.object({
  userId: z.string().uuid(),
  delta: z.coerce.number().int().min(-999).max(999),
  roundId: z.string(),
  reason: z.string().trim().min(3),
});

/**
 * Ajoute ou retire des points à la main — un pari perdu, un gage, une
 * correction. La raison est obligatoire : elle s'affiche telle quelle aux
 * joueurs, qui doivent pouvoir comprendre d'où viennent ces points.
 */
export async function adjustPoints(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = adjustmentSchema.safeParse({
      userId: formData.get("userId"),
      delta: formData.get("delta"),
      roundId: formData.get("roundId"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return adminFail("Ajustement invalide.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { userId, delta, roundId: rawRound, reason } = parsed.data;
    if (delta === 0) return adminFail("Un ajustement de zéro point ne sert à rien.");

    const roundId = rawRound.trim() === "" ? null : rawRound;
    const admin = createAdminClient();
    const seasonId = await currentSeasonId(admin);

    const { data: player, error: pErr } = await admin
      .from("profiles").select("display_name").eq("id", userId).single();
    if (pErr) throw pErr;

    const { data: inserted, error: iErr } = await admin
      .from("point_adjustments")
      .insert({
        user_id: userId,
        season_id: seasonId,
        round_id: roundId,
        delta,
        reason,
        source: "admin",
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (iErr) throw iErr;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "points.adjusted",
      entityType: "point_adjustment",
      entityId: inserted.id as Uuid,
      after: { delta, reason, players: player.display_name },
      reason,
      event: roundId ? { roundId } : undefined,
    });

    revalidatePathsAfterPlayer();
    return adminOk(
      `${delta > 0 ? "+" : ""}${delta} point${Math.abs(delta) > 1 ? "s" : ""} pour ${player.display_name}.`,
    );
  } catch (error) {
    return handle(error);
  }
}

const revertSchema = z.object({
  adjustmentId: z.string().uuid(),
  reason: z.string(),
});

/**
 * Annule un ajustement par un ajustement inverse.
 *
 * On n'efface pas la ligne d'origine : un joueur qui a vu ses points bouger
 * doit pouvoir retrouver pourquoi, même après correction.
 */
export async function revertAdjustment(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = revertSchema.safeParse({
      adjustmentId: formData.get("adjustmentId"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) return adminFail("Ajustement introuvable.");
    const { adjustmentId, reason } = parsed.data;

    const admin = createAdminClient();
    const { data: original, error: oErr } = await admin
      .from("point_adjustments")
      .select("id, user_id, season_id, round_id, delta, reason, source_id")
      .eq("id", adjustmentId)
      .single();
    if (oErr) throw oErr;

    if (original.source_id) {
      return adminFail("Cet ajustement en annule déjà un autre.");
    }

    const { error: iErr } = await admin.from("point_adjustments").insert({
      user_id: original.user_id,
      season_id: original.season_id,
      round_id: original.round_id,
      delta: -(original.delta as number),
      reason: `Annulation : ${original.reason}`,
      source: "admin",
      source_id: adjustmentId,
      created_by: ctx.userId,
    });
    if (iErr) throw iErr;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "points.adjustment_reverted",
      entityType: "point_adjustment",
      entityId: adjustmentId,
      before: { delta: original.delta, reason: original.reason },
      after: { delta: -(original.delta as number), reverts: adjustmentId },
      reason,
    });

    revalidatePathsAfterPlayer();
    return adminOk("Ajustement annulé.");
  } catch (error) {
    return handle(error);
  }
}

/**
 * Une clé publique VAPID est un point de courbe P-256 non compressé, encodé en
 * base64url : 65 octets, donc 87 caractères, et un premier octet `0x04` qui se
 * lit « B » une fois encodé. On vérifie la forme plutôt que d'accepter
 * n'importe quoi : une clé mal collée laisserait les notifications
 * silencieusement mortes, sans rien à l'écran pour le dire.
 */
const vapidSchema = z.object({
  vapidKey: z
    .string()
    .trim()
    .regex(/^B[A-Za-z0-9_-]{86}$/, "Clé publique VAPID invalide."),
  reason: z.string(),
});

export async function updateVapidKey(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = vapidSchema.safeParse({
      vapidKey: formData.get("vapidKey"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return adminFail(
        "Clé publique VAPID invalide : 87 caractères commençant par « B ».",
        { fieldErrors: fieldErrorsOf(parsed.error) },
      );
    }
    const { vapidKey, reason } = parsed.data;

    const admin = createAdminClient();
    const before = await loadPublicKey(admin);
    if (before === vapidKey) return adminOk("Cette clé est déjà enregistrée.");

    const { error } = await admin
      .from("app_settings")
      .upsert(
        { key: "push_notifications.vapid_public_key", value: vapidKey, updated_by: ctx.userId },
        { onConflict: "key" },
      );
    if (error) throw error;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "push.vapid_key_changed",
      entityType: "app_setting",
      entityId: null,
      // La clé est publique, mais la journaliser entière n'apprend rien : on
      // garde de quoi reconnaître laquelle a remplacé laquelle.
      before: { key_suffix: before ? before.slice(-8) : null },
      after: { key_suffix: vapidKey.slice(-8) },
      reason,
    });

    revalidatePath("/reglages");
    revalidatePath("/admin/push-settings");
    return adminOk(
      before
        ? "Clé enregistrée. Les joueurs devront réactiver leurs notifications : les anciens abonnements ne valent plus."
        : "Clé enregistrée. Les notifications sont disponibles depuis l'écran Réglages.",
    );
  } catch (error) {
    return handle(error);
  }
}

/* ---------------------------------------------------------------------------
   Notifications — annonces, test, garde-fous

   Trois actions, trois portées distinctes :

     · le **test** ne parle qu'à l'administrateur et court-circuite tout — file,
       plafond, heures de silence. C'est un diagnostic : il doit sonner tout de
       suite, ou dire précisément pourquoi il n'a pas sonné.
     · l'**annonce** passe par la file, donc respecte les heures de silence et
       les joueurs qui ont coupé. Elle ignore le seul plafond quotidien, qui
       existe pour brider l'automatique, pas la parole de l'organisation.
     · les **garde-fous** ne font que réécrire `app_settings`.
   --------------------------------------------------------------------------- */

const announcementSchema = z.object({
  title: z.string().trim().min(3, "Trois caractères minimum.").max(80, "80 caractères maximum."),
  body: z.string().trim().min(3, "Trois caractères minimum.").max(300, "300 caractères maximum."),
  url: z.string().trim().max(200).optional(),
  reason: z.string(),
});

const rulesSchema = z.object({
  enabled: z.coerce.boolean(),
  maxPerDay: z.coerce.number(),
  quietFrom: z.string().trim(),
  quietTo: z.string().trim(),
  timeZone: z.string().trim(),
  reason: z.string(),
});

/** Les joueurs actifs du groupe — les destinataires d'une annonce. */
async function activeMemberIds(admin: SupabaseClient, groupId: Uuid): Promise<Uuid[]> {
  const { data, error } = await admin
    .from("group_members")
    .select("user_id, profiles:user_id (is_active)")
    .eq("group_id", groupId);
  if (error) throw error;

  return (data ?? [])
    .filter((m) => {
      const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as
        | { is_active?: boolean }
        | null;
      return p?.is_active !== false;
    })
    .map((m) => m.user_id as Uuid);
}

/**
 * Envoie une notification à l'administrateur, tout de suite.
 *
 * Volontairement hors de la file : le but est de répondre à « est-ce que ça
 * marche vraiment ? », et une réponse qui arrive au prochain passage du
 * planificateur ne répond à rien.
 */
export async function sendTestNotification(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const reason = normalizeReason(formData.get("reason"));
    const admin = createAdminClient();

    if (!(await loadPublicKey(admin))) {
      return adminFail("Aucune clé publique enregistrée : renseigne-la avant de tester.");
    }
    if (!process.env.VAPID_PRIVATE_KEY) {
      return adminFail("La clé privée manque côté serveur (variable VAPID_PRIVATE_KEY chez Vercel).");
    }

    const { count } = await admin
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .is("revoked_at", null);

    if ((count ?? 0) === 0) {
      return adminFail(
        "Aucun appareil abonné pour toi. Va dans Réglages, active l'interrupteur, puis reviens.",
      );
    }

    const result = await sendToUser(admin, ctx.userId, {
      title: "Test des notifications",
      body: "Si tu lis ceci, tout fonctionne. Bonne saison 🏉",
      url: "/reglages",
      kind: "announcement",
      tag: "test",
    });

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "push.test_sent",
      entityType: "app_setting",
      entityId: null,
      before: null,
      after: { sent: result.sent, failed: result.failed, revoked: result.revoked },
      reason,
    });

    if (result.sent > 0) {
      return adminOk(
        `Message parti vers ${result.sent} appareil${result.sent > 1 ? "s" : ""}. Il devrait s'afficher dans quelques secondes.`,
        result.revoked > 0
          ? { details: [`${result.revoked} abonnement périmé a été retiré au passage.`] }
          : {},
      );
    }

    return adminFail("Aucun appareil n'a accepté le message.", {
      details:
        result.errors.length > 0
          ? result.errors
          : ["Le service de push n'a rien renvoyé d'exploitable."],
    });
  } catch (error) {
    return handle(error);
  }
}

/**
 * Écrit un message et l'envoie à tout le groupe.
 *
 * Le compte rendu distingue chaque sort possible : une annonce avalée par les
 * réglages d'un joueur doit se voir, sinon l'administrateur croit avoir parlé
 * dans le vide — ou pire, croit avoir été entendu.
 */
export async function sendAnnouncement(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = announcementSchema.safeParse({
      title: formData.get("title"),
      body: formData.get("body"),
      url: formData.get("url") ?? undefined,
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return adminFail("Message incomplet.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { title, body, url, reason } = parsed.data;

    const admin = createAdminClient();
    const settings = await loadSettings(admin);
    const rules = readRules(settings);

    if (!rules.enabled) {
      return adminFail(
        "Les notifications du groupe sont éteintes : rallume-les avant d'envoyer une annonce.",
      );
    }

    const members = await activeMemberIds(admin, ctx.groupId);
    // Un horodatage dans la clé : deux annonces de suite ne se dédoublonnent pas.
    const stamp = new Date().toISOString();
    const tally: Record<EnqueueOutcome, number> = {
      queued: 0, duplicate: 0, off: 0, muted: 0, capped: 0,
    };

    for (const userId of members) {
      const outcome = await enqueue(
        admin,
        {
          userId,
          kind: "announcement",
          title,
          body,
          url: url && url.length > 0 ? url : "/",
          dedupeKey: `announcement:${ctx.userId}:${stamp}`,
        },
        // Une annonce est délibérée et rare : le plafond du jour, qui protège
        // du bruit automatique, ne doit pas l'étouffer.
        { ignoreDailyCap: true },
      );
      tally[outcome] += 1;
    }

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "push.announcement_sent",
      entityType: "app_setting",
      entityId: null,
      before: null,
      after: { title, body, recipients: tally.queued, muted: tally.muted },
      reason,
      event: { payload: { title } },
    });

    // Les heures de silence peuvent décaler l'envoi : autant le dire tout de suite.
    const departure = scheduleFor(new Date(), {
      from: rules.quietFrom, to: rules.quietTo, timeZone: rules.timeZone,
    });
    const delayed = departure.getTime() - Date.now() > 60_000;

    if (tally.queued === 0) {
      return adminFail("Personne ne recevra ce message.", {
        details: [
          tally.muted > 0
            ? `${tally.muted} joueur${tally.muted > 1 ? "s ont" : " a"} coupé les notifications ou ce type de message.`
            : "Aucun joueur actif à qui écrire.",
        ],
      });
    }

    const details: string[] = [];
    if (delayed) {
      details.push(
        `Heures de silence en cours : départ prévu à ${new Intl.DateTimeFormat("fr-FR", {
          hour: "2-digit", minute: "2-digit", timeZone: rules.timeZone,
        }).format(departure)}.`,
      );
    }
    if (tally.muted > 0) {
      details.push(`${tally.muted} joueur${tally.muted > 1 ? "s" : ""} ne le recevra pas (notifications coupées).`);
    }

    revalidatePath("/admin/push-settings");
    return adminOk(
      `Message mis en file pour ${tally.queued} joueur${tally.queued > 1 ? "s" : ""}.`,
      details.length > 0 ? { details } : {},
    );
  } catch (error) {
    return handle(error);
  }
}

/** Les garde-fous du groupe : interrupteur, plafond, heures de silence. */
export async function updateNotificationRules(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = rulesSchema.safeParse({
      enabled: formData.get("enabled") === "on" || formData.get("enabled") === "true",
      maxPerDay: formData.get("maxPerDay"),
      quietFrom: formData.get("quietFrom"),
      quietTo: formData.get("quietTo"),
      timeZone: formData.get("timeZone"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return adminFail("Réglages invalides.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { reason, ...input } = parsed.data;

    // La validation métier vit dans une fonction pure, donc testable — et la
    // même que celle qui décrit les règles à l'écran.
    const errors = validateRules(input);
    if (Object.keys(errors).length > 0) {
      return adminFail("Réglages invalides.", {
        fieldErrors: Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v]])),
      });
    }

    const admin = createAdminClient();
    const before = readRules(await loadSettings(admin));

    const { error } = await admin.from("app_settings").upsert(
      rulesToRows(input).map((r) => ({ ...r, updated_by: ctx.userId })),
      { onConflict: "key" },
    );
    if (error) throw error;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "push.rules_changed",
      entityType: "app_setting",
      entityId: null,
      before,
      after: input,
      reason,
    });

    revalidatePath("/admin/push-settings");
    revalidatePath("/reglages");

    return adminOk(
      input.enabled
        ? `Réglages enregistrés : ${input.maxPerDay} message${input.maxPerDay > 1 ? "s" : ""} par jour au plus, ${describeQuiet(input)}.`
        : "Notifications éteintes pour tout le groupe. Plus rien ne partira, même une annonce.",
    );
  } catch (error) {
    return handle(error);
  }
}

/* ---------------------------------------------------------------------------
   Synchronisation des données sportives.

   Ces trois actions appellent le même code que le planificateur Cloudflare,
   mais sans passer par HTTP : l'administrateur est déjà authentifié, il n'y a
   donc ni secret à présenter ni route à exposer.

   Leur raison d'être n'est pas le confort. Le planificateur peut tomber un
   samedi soir, un fournisseur peut changer un libellé en cours de saison :
   sans ce bouton, la seule issue serait de saisir les scores à la main. Avec
   lui, elle est de cliquer.
   --------------------------------------------------------------------------- */

const syncSchema = z.object({
  reason: z.string().optional(),
  // Choisir la saison permet d'éprouver la chaîne sur une compétition qui
  // joue *maintenant*, sans attendre que le Top 14 commence. Absent, on
  // retombe sur la saison active.
  seasonId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
});

/** Ce que l'écran doit lire, quel que soit le type de synchronisation. */
function describeUnmatched(unmatched: string[]): string[] {
  if (unmatched.length === 0) return [];
  // Une équipe non rapprochée est la panne silencieuse par excellence : le
  // match existe, le score arrive, et rien ne se raccroche.
  return [
    `${unmatched.length} nom${unmatched.length > 1 ? "s" : ""} non rapproché${unmatched.length > 1 ? "s" : ""} : ${unmatched.join(", ")}`,
    "Ajoute un alias dans app_settings.sync.team_aliases pour chacun.",
  ];
}

async function runSync<T extends { status: string; provider: string; requestsUsed: number; warnings: string[]; error?: string }>(
  formData: FormData,
  action: "sync.calendar_run" | "sync.live_run" | "sync.standings_run",
  run: (ctx: Awaited<ReturnType<typeof createSyncContext>>) => Promise<T>,
  summarize: (report: T) => { message: string; details: string[] },
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = syncSchema.safeParse({
      reason: formData.get("reason"),
      seasonId: formData.get("seasonId") ?? undefined,
    });
    const reason = normalizeReason(parsed.success ? parsed.data.reason : undefined);

    const admin = createAdminClient();
    const syncCtx = await createSyncContext(admin, {
      seasonId: parsed.success ? parsed.data.seasonId : undefined,
    });
    const report = await run(syncCtx);

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action,
      entityType: "season",
      entityId: syncCtx.season.id,
      before: null,
      after: report,
      reason,
    });

    revalidatePath("/admin/synchronisation");
    revalidatePath("/admin/matchs");
    revalidatePath("/journee");
    revalidatePath("/classement");

    const { message, details } = summarize(report);
    const all = [...details, ...describeUnmatched((report as { unmatched?: string[] }).unmatched ?? []), ...report.warnings];

    // « failed » n'est pas une exception : la dernière donnée connue reste en
    // base, et c'est justement ce que le rapport doit dire.
    return report.status === "failed"
      ? adminFail(report.error ?? "La synchronisation a échoué.", { details: all })
      : adminOk(message, { details: all });
  } catch (error) {
    return handle(error);
  }
}

export async function runCalendarSync(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return runSync(formData, "sync.calendar_run", (ctx) => syncCalendar(ctx), (r) => ({
    message: `Calendrier synchronisé depuis ${r.provider} : ${r.fixturesReceived} match${r.fixturesReceived > 1 ? "s" : ""} reçu${r.fixturesReceived > 1 ? "s" : ""}.`,
    details: [
      // L'amorçage n'arrive qu'une fois par compétition, mais il mérite d'être
      // lu : les codes générés sont provisoires et méritent une relecture.
      ...(r.teamsCreated.length > 0
        ? [`${r.teamsCreated.length} équipes créées : ${r.teamsCreated.join(", ")}`]
        : []),
      `${r.fixturesCreated} créé${r.fixturesCreated > 1 ? "s" : ""}, ${r.fixturesUpdated} mis à jour, ${r.roundsCreated} journée${r.roundsCreated > 1 ? "s" : ""} créée${r.roundsCreated > 1 ? "s" : ""}.`,
      `${r.kickoffsConfirmed} horaire${r.kickoffsConfirmed > 1 ? "s" : ""} confirmé${r.kickoffsConfirmed > 1 ? "s" : ""} — seul un horaire confirmé fixe l'heure de verrouillage.`,
      `${r.requestsUsed} requête${r.requestsUsed > 1 ? "s" : ""} consommée${r.requestsUsed > 1 ? "s" : ""}.`,
      ...r.changes.slice(0, 12),
    ],
  }));
}

export async function runLiveSync(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  // `force` passe outre la fenêtre de match : c'est le mode « je veux voir
  // maintenant si ça marche », qui est précisément l'usage du bouton.
  return runSync(formData, "sync.live_run", (ctx) => syncLive(ctx, { force: true }), (r) => ({
    message: `Scores relevés depuis ${r.provider} : ${r.fixturesUpdated} match${r.fixturesUpdated > 1 ? "s" : ""} mis à jour.`,
    details: [
      r.inWindow ? "Une fenêtre de match est ouverte." : "Aucun match en cours — relevé forcé.",
      ...(r.finished.length > 0
        ? [
            `${r.finished.length} match${r.finished.length > 1 ? "s" : ""} terminé${r.finished.length > 1 ? "s" : ""}.`,
            // Le chiffre qui compte vraiment : un score écrit sans points
            // distribués laisserait le classement à zéro sans rien signaler.
            `${r.predictionsScored} pronostic${r.predictionsScored > 1 ? "s" : ""} noté${r.predictionsScored > 1 ? "s" : ""}.`,
          ]
        : []),
      `${r.requestsUsed} requête${r.requestsUsed > 1 ? "s" : ""} consommée${r.requestsUsed > 1 ? "s" : ""}.`,
      ...r.changes.slice(0, 12),
    ],
  }));
}

export async function runStandingsSync(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return runSync(formData, "sync.standings_run", (ctx) => syncStandings(ctx), (r) => ({
    message: `Classement sportif rafraîchi depuis ${r.provider} : ${r.rowsWritten} ligne${r.rowsWritten > 1 ? "s" : ""} écrite${r.rowsWritten > 1 ? "s" : ""}.`,
    details: [
      `${r.rowsReceived} ligne${r.rowsReceived > 1 ? "s" : ""} reçue${r.rowsReceived > 1 ? "s" : ""}.`,
      `${r.requestsUsed} requête${r.requestsUsed > 1 ? "s" : ""} consommée${r.requestsUsed > 1 ? "s" : ""}.`,
    ],
  }));
}
