"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { recomputeSeason, type RecomputeSummary } from "@/lib/scoring/persist";
import type { Uuid } from "@/lib/types";
import { requireAdmin } from "../auth";
import { logAdminAction } from "../log";
import { adminFail, adminOk, type AdminActionState } from "../types";
import { loadActiveSeason } from "@/lib/standings/queries";
import { fieldErrorsOf, handle } from "./shared";

/**
 * Barème — extrait de l'ancien `actions.ts` (audit technique, tâche « Split
 * admin/actions.ts »). Pur déplacement : aucun comportement ni signature ne
 * change, `../../actions.ts` réexporte tout.
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

async function currentRuleset(admin: SupabaseClient, seasonId: Uuid): Promise<CurrentRuleset> {
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
  leagueId: z.string().uuid(),
  wrong: z.coerce.number().int().min(0).max(999),
  winner: z.coerce.number().int().min(0).max(999),
  winnerAndMargin: z.coerce.number().int().min(0).max(999),
  exactScore: z.coerce.number().int().min(0).max(999),
  scope: scopeField,
});

/** Les quatre valeurs de la cascade. */
export async function updatePoints(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = pointsSchema.safeParse({
      leagueId: formData.get("leagueId"),
      wrong: formData.get("wrong"),
      winner: formData.get("winner"),
      winnerAndMargin: formData.get("winnerAndMargin"),
      exactScore: formData.get("exactScore"),
      scope: formData.get("scope"),
    });
    if (!parsed.success) {
      return adminFail("Valeurs invalides.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { leagueId, wrong, winner, winnerAndMargin, exactScore, scope } = parsed.data;
    // Deuxième vérification, par ligue (audit P0, point 2) : voir recordResult.
    await requireAdmin(leagueId);

    // La cascade doit rester croissante, sinon viser juste ferait perdre des points.
    if (!(wrong <= winner && winner <= winnerAndMargin && winnerAndMargin <= exactScore)) {
      return adminFail(
        "La cascade doit être croissante : mauvais ≤ vainqueur ≤ vainqueur + tranche ≤ score exact.",
      );
    }

    const admin = createAdminClient();
    const season = await loadActiveSeason(admin, leagueId);
    if (!season) return adminFail("Aucune saison pour cette ligue.");
    const rs = await currentRuleset(admin, season.id);
    const points = {
      wrong,
      winner,
      winner_and_margin: winnerAndMargin,
      exact_score: exactScore,
    };

    const reason = "Barème des points modifié depuis l'espace admin.";
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
  leagueId: z.string().uuid(),
  minutesBeforeKickoff: z.coerce.number().int().min(0).max(10_080),
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
      leagueId: formData.get("leagueId"),
      minutesBeforeKickoff: formData.get("minutesBeforeKickoff"),
    });
    if (!parsed.success) {
      return adminFail("Délai invalide.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { leagueId, minutesBeforeKickoff } = parsed.data;
    // Deuxième vérification, par ligue (audit P0, point 2) : voir recordResult.
    await requireAdmin(leagueId);

    const admin = createAdminClient();
    const season = await loadActiveSeason(admin, leagueId);
    if (!season) return adminFail("Aucune saison pour cette ligue.");
    const rs = await currentRuleset(admin, season.id);
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
      reason: "Délai de verrouillage modifié depuis l'espace admin.",
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
  leagueId: z.string().uuid(),
  quota: z.string(),
  period: z.enum(["match", "round", "month", "season"]),
  scope: scopeField,
});

/** Quota de scores exacts : combien de tentatives, sur quelle période. */
export async function updateExactScoreQuota(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = exactScoreSchema.safeParse({
      leagueId: formData.get("leagueId"),
      quota: formData.get("quota"),
      period: formData.get("period"),
      scope: formData.get("scope"),
    });
    if (!parsed.success) {
      return adminFail("Quota invalide.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { leagueId, quota: rawQuota, period, scope } = parsed.data;
    // Deuxième vérification, par ligue (audit P0, point 2) : voir recordResult.
    await requireAdmin(leagueId);

    // Champ vide = illimité. On le distingue de zéro, qui interdit tout.
    const quota = rawQuota.trim() === "" ? null : Number(rawQuota);
    if (quota !== null && (!Number.isInteger(quota) || quota < 0 || quota > 99)) {
      return adminFail("Quota invalide.", {
        fieldErrors: { quota: ["Un entier entre 0 et 99, ou vide pour illimité."] },
      });
    }

    const admin = createAdminClient();
    const season = await loadActiveSeason(admin, leagueId);
    if (!season) return adminFail("Aucune saison pour cette ligue.");
    const rs = await currentRuleset(admin, season.id);
    const previous = (rs.rules.exact_score ?? {}) as Record<string, unknown>;
    const exact = { ...previous, quota, period };
    const reason = "Quota de scores exacts modifié depuis l'espace admin.";

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
  leagueId: z.string().uuid(),
  bucketId: z.string().uuid(),
  label: z.string().trim().min(1).max(40),
  minPoints: z.coerce.number().int().min(0).max(200),
  maxPoints: z.string(),
  scope: scopeField,
});

/** Renomme et reborne une tranche d'écart. */
export async function updateMarginBucket(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = bucketSchema.safeParse({
      leagueId: formData.get("leagueId"),
      bucketId: formData.get("bucketId"),
      label: formData.get("label"),
      minPoints: formData.get("minPoints"),
      maxPoints: formData.get("maxPoints"),
      scope: formData.get("scope"),
    });
    if (!parsed.success) {
      return adminFail("Tranche invalide.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { leagueId, bucketId, label, minPoints, maxPoints: rawMax, scope } = parsed.data;
    // Deuxième vérification, par ligue (audit P0, point 2) : voir recordResult.
    await requireAdmin(leagueId);

    // Champ vide = borne haute ouverte (la dernière tranche, « 41 et + »).
    const maxPoints = rawMax.trim() === "" ? null : Number(rawMax);
    if (maxPoints !== null && (!Number.isInteger(maxPoints) || maxPoints < minPoints)) {
      return adminFail("Tranche invalide.", {
        fieldErrors: { maxPoints: ["Doit être vide, ou supérieur ou égal au minimum."] },
      });
    }

    const admin = createAdminClient();
    const season = await loadActiveSeason(admin, leagueId);
    if (!season) return adminFail("Aucune saison pour cette ligue.");
    const rs = await currentRuleset(admin, season.id);
    const reason = `Tranche d'écart modifiée : ${label}.`;

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
