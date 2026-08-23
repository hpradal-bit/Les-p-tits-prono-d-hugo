"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { recomputeFixtures, recomputeRound, recomputeSeason } from "@/lib/scoring/persist";
import type { Uuid } from "@/lib/types";
import { requireAdmin, AdminError } from "./auth";
import { logAdminAction, MissingReasonError } from "./log";
import { adminFail, adminOk, type AdminActionState } from "./types";
import { currentSeasonId } from "./queries";

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
 * Un changement de barème ne réécrit pas l'histoire à la main : il modifie la
 * règle, puis rejoue la saison entière. `computeScore` étant pure, le
 * classement obtenu est exactement celui qu'on aurait eu si le nouveau barème
 * avait été en vigueur depuis le premier match (règle n° 2).
 */

interface CurrentRuleset {
  id: Uuid;
  seasonId: Uuid;
  rules: Record<string, unknown>;
}

async function currentRuleset(admin: SupabaseClient): Promise<CurrentRuleset> {
  const seasonId = await currentSeasonId(admin);
  const { data, error } = await admin
    .from("scoring_rulesets")
    .select("id, rules")
    .eq("season_id", seasonId)
    .lte("effective_from", new Date().toISOString())
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return {
    id: data.id as Uuid,
    seasonId,
    rules: (data.rules ?? {}) as Record<string, unknown>,
  };
}

/** Écrit une branche du JSON du barème, sans toucher au reste. */
async function patchRules(
  admin: SupabaseClient,
  rulesetId: Uuid,
  rules: Record<string, unknown>,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin
    .from("scoring_rulesets")
    .update({ rules: { ...rules, ...patch } })
    .eq("id", rulesetId);
  if (error) throw error;
}

/** Un barème touche tous les écrans qui affichent des points. */
function revalidatePathsAfterRuleset(): void {
  for (const path of ["/admin/bareme", "/regles", "/journee", "/classement"]) {
    revalidatePath(path);
  }
}

function recomputeSentence(summary: { predictions: number; points: number }): string {
  if (summary.predictions === 0) return "Aucun pronostic à recalculer pour l'instant.";
  return `${summary.predictions} pronostic${summary.predictions > 1 ? "s" : ""} rejoué${summary.predictions > 1 ? "s" : ""}, ${summary.points} point${summary.points > 1 ? "s" : ""} au total.`;
}

const pointsSchema = z.object({
  wrong: z.coerce.number().int().min(0).max(999),
  winner: z.coerce.number().int().min(0).max(999),
  winnerAndMargin: z.coerce.number().int().min(0).max(999),
  exactScore: z.coerce.number().int().min(0).max(999),
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
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return adminFail("Valeurs invalides.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { wrong, winner, winnerAndMargin, exactScore, reason } = parsed.data;

    // La cascade doit rester croissante, sinon viser juste ferait perdre des points.
    if (!(wrong <= winner && winner <= winnerAndMargin && winnerAndMargin <= exactScore)) {
      return adminFail(
        "La cascade doit être croissante : mauvais ≤ vainqueur ≤ vainqueur + tranche ≤ score exact.",
      );
    }

    const admin = createAdminClient();
    const rs = await currentRuleset(admin);
    const before = { points: rs.rules.points };
    const points = {
      wrong,
      winner,
      winner_and_margin: winnerAndMargin,
      exact_score: exactScore,
    };

    await patchRules(admin, rs.id, rs.rules, { points });
    const summary = await recomputeSeason(admin, rs.seasonId);

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "ruleset.points_changed",
      entityType: "scoring_ruleset",
      entityId: rs.id,
      before,
      after: { points },
      reason,
    });

    revalidatePathsAfterRuleset();
    return adminOk(`Barème enregistré. ${recomputeSentence(summary)}`);
  } catch (error) {
    return handle(error);
  }
}

const lockSchema = z.object({
  minutesBeforeKickoff: z.coerce.number().int().min(0).max(10_080),
  reason: z.string(),
});

/**
 * Délai de verrouillage. Changer la règle ne suffit pas : les matchs déjà
 * programmés portent leur propre `locks_at`, calculé au moment de la création.
 * On les recalcule tous, sauf ceux dont l'heure est déjà passée — rouvrir un
 * match verrouillé laisserait pronostiquer un résultat connu.
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

    await patchRules(admin, rs.id, rs.rules, { lock });

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
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return adminFail("Quota invalide.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { quota: rawQuota, period, reason } = parsed.data;

    // Champ vide = illimité. On le distingue de zéro, qui interdit tout.
    const quota = rawQuota.trim() === "" ? null : Number(rawQuota);
    if (quota !== null && (!Number.isInteger(quota) || quota < 0 || quota > 99)) {
      return adminFail("Quota invalide.", {
        fieldErrors: { quota: ["Un entier entre 0 et 99, ou vide pour illimité."] },
      });
    }

    const admin = createAdminClient();
    const rs = await currentRuleset(admin);
    const before = { exact_score: rs.rules.exact_score };
    const previous = (rs.rules.exact_score ?? {}) as Record<string, unknown>;
    const exact = { ...previous, quota, period };

    await patchRules(admin, rs.id, rs.rules, { exact_score: exact });
    const summary = await recomputeSeason(admin, rs.seasonId);

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "ruleset.exact_score_changed",
      entityType: "scoring_ruleset",
      entityId: rs.id,
      before,
      after: { exact_score: exact },
      reason,
    });

    revalidatePathsAfterRuleset();
    return adminOk(`Quota enregistré. ${recomputeSentence(summary)}`);
  } catch (error) {
    return handle(error);
  }
}

const bucketSchema = z.object({
  bucketId: z.string().uuid(),
  label: z.string().trim().min(1).max(40),
  minPoints: z.coerce.number().int().min(0).max(200),
  maxPoints: z.string(),
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
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return adminFail("Tranche invalide.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { bucketId, label, minPoints, maxPoints: rawMax, reason } = parsed.data;

    // Champ vide = borne haute ouverte (la dernière tranche, « 41 et + »).
    const maxPoints = rawMax.trim() === "" ? null : Number(rawMax);
    if (maxPoints !== null && (!Number.isInteger(maxPoints) || maxPoints < minPoints)) {
      return adminFail("Tranche invalide.", {
        fieldErrors: { maxPoints: ["Doit être vide, ou supérieur ou égal au minimum."] },
      });
    }

    const admin = createAdminClient();
    const { data: before, error: bErr } = await admin
      .from("margin_buckets")
      .select("id, ruleset_id, label, min_points, max_points")
      .eq("id", bucketId)
      .single();
    if (bErr) throw bErr;

    const { error: uErr } = await admin
      .from("margin_buckets")
      .update({ label, min_points: minPoints, max_points: maxPoints })
      .eq("id", bucketId);
    if (uErr) throw uErr;

    const { data: rsRow, error: rErr } = await admin
      .from("scoring_rulesets").select("season_id").eq("id", before.ruleset_id).single();
    if (rErr) throw rErr;

    const summary = await recomputeSeason(admin, rsRow.season_id as Uuid);

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "ruleset.margin_bucket_changed",
      entityType: "margin_bucket",
      entityId: bucketId,
      before: { label: before.label, min_points: before.min_points, max_points: before.max_points },
      after: { label, min_points: minPoints, max_points: maxPoints },
      reason,
    });

    revalidatePathsAfterRuleset();
    return adminOk(`Tranche « ${label} » enregistrée. ${recomputeSentence(summary)}`);
  } catch (error) {
    return handle(error);
  }
}
