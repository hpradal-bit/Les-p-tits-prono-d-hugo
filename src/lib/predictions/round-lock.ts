import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRuleset } from "@/lib/settings";
import type { MatchOutcome, Uuid } from "@/lib/types";
import { buildDefaultPrediction, consensusOutcome } from "./defaults";

/**
 * Le verrouillage d'une journée, côté serveur.
 *
 * Appelé par le planificateur (Cloudflare Worker) ou par l'admin, jamais par un
 * navigateur. Il lui faut un client Supabase de service : les pronos par défaut
 * sont posés APRÈS `locks_at`, donc précisément à l'instant où plus personne
 * d'autre n'a le droit d'écrire.
 *
 * L'opération est rejouable : relancée deux fois, elle ne crée rien de plus.
 */

export interface LockRoundReport {
  roundId: Uuid;
  /** Matchs de la journée effectivement verrouillés à l'heure du serveur. */
  lockedFixtures: number;
  /** Pronos par défaut créés à cet appel. */
  created: number;
  /** Le barème autorise-t-il le prono par défaut ? */
  defaultPredictionEnabled: boolean;
  /** Journée déjà entièrement traitée : rien à faire. */
  skipped: boolean;
}

interface Member {
  userId: Uuid;
}

/**
 * Pose les pronos par défaut sur tous les matchs verrouillés d'une journée,
 * pour tous les joueurs actifs qui n'ont rien joué.
 */
export async function applyDefaultPredictionsForRound(
  admin: SupabaseClient,
  roundId: Uuid,
  opts: { now?: Date } = {},
): Promise<LockRoundReport> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();

  const empty: LockRoundReport = {
    roundId,
    lockedFixtures: 0,
    created: 0,
    defaultPredictionEnabled: false,
    skipped: true,
  };

  // --- Journée & saison -------------------------------------------------------
  const { data: round, error: roundError } = await admin
    .from("rounds")
    .select("id, season_id, number, name")
    .eq("id", roundId)
    .maybeSingle();
  if (roundError || !round) return empty;

  const seasonId = round.season_id as string;
  const ruleset = await loadRuleset(admin, seasonId);

  // --- Matchs déjà verrouillés ------------------------------------------------
  const { data: fixtureRows } = await admin
    .from("fixtures")
    .select("id, locks_at")
    .eq("round_id", roundId)
    .lte("locks_at", nowIso);
  const lockedFixtures = (fixtureRows ?? []).map((f) => f.id as string);

  if (lockedFixtures.length === 0) {
    return { ...empty, defaultPredictionEnabled: ruleset.defaultPrediction.enabled };
  }

  // Le verrouillage a lieu de toute façon : on fige les pronostics existants,
  // que le prono par défaut soit activé ou non.
  await admin
    .from("predictions")
    .update({ locked_at: nowIso })
    .in("fixture_id", lockedFixtures)
    .is("locked_at", null);

  await admin
    .from("rounds")
    .update({ status: "locked", locked_at: nowIso })
    .eq("id", roundId)
    .neq("status", "settled");

  if (!ruleset.defaultPrediction.enabled) {
    return {
      roundId,
      lockedFixtures: lockedFixtures.length,
      created: 0,
      defaultPredictionEnabled: false,
      skipped: false,
    };
  }

  // --- Qui joue ? -------------------------------------------------------------
  const { data: memberRows } = await admin
    .from("group_members")
    .select("user_id, profiles!inner(is_active)")
    .eq("profiles.is_active", true);

  const members: Member[] = Array.from(
    new Set((memberRows ?? []).map((m) => String(m.user_id))),
  ).map((userId) => ({ userId }));

  if (members.length === 0) {
    return {
      roundId,
      lockedFixtures: lockedFixtures.length,
      created: 0,
      defaultPredictionEnabled: true,
      skipped: false,
    };
  }

  // --- Ce qui existe déjà sur ces matchs -------------------------------------
  const { data: existingRows } = await admin
    .from("predictions")
    .select("user_id, fixture_id, outcome")
    .in("fixture_id", lockedFixtures);

  const existing = new Set(
    (existingRows ?? []).map((p) => `${p.user_id}:${p.fixture_id}`),
  );

  // Consensus du groupe sur chaque match (mode « median »).
  const outcomesByFixture = new Map<string, MatchOutcome[]>();
  for (const p of existingRows ?? []) {
    const list = outcomesByFixture.get(String(p.fixture_id)) ?? [];
    list.push(p.outcome as MatchOutcome);
    outcomesByFixture.set(String(p.fixture_id), list);
  }

  // Dernière issue jouée par chaque joueur sur la saison (mode « last_choice »).
  const lastChoice = await loadLastChoices(admin, seasonId);

  // --- Construction des pronos manquants -------------------------------------
  const toInsert = [];
  for (const member of members) {
    for (const fixtureId of lockedFixtures) {
      if (existing.has(`${member.userId}:${fixtureId}`)) continue;

      const draft = buildDefaultPrediction(ruleset, {
        lastChoice: lastChoice.get(member.userId) ?? null,
        consensus: consensusOutcome(outcomesByFixture.get(fixtureId) ?? []),
      });

      toInsert.push({
        user_id: member.userId,
        fixture_id: fixtureId,
        outcome: draft.outcome,
        margin_bucket_id: draft.marginBucketId,
        margin_value: draft.marginValue,
        is_auto: true,
        locked_at: nowIso,
      });
    }
  }

  if (toInsert.length === 0) {
    return {
      roundId,
      lockedFixtures: lockedFixtures.length,
      created: 0,
      defaultPredictionEnabled: true,
      skipped: false,
    };
  }

  const { data: inserted, error: insertError } = await admin
    .from("predictions")
    .upsert(toInsert, { onConflict: "user_id,fixture_id", ignoreDuplicates: true })
    .select("id, user_id, fixture_id, outcome");

  if (insertError) throw insertError;
  const created = inserted ?? [];

  // --- Le flux d'événements ---------------------------------------------------
  // Règle 8 : tout passe par `events`. Le fil social, les badges et les
  // notifications lisent ce flux, ils ne recalculent rien.
  if (created.length > 0) {
    await admin.from("events").insert(
      created.map((p) => ({
        kind: "auto_prediction",
        season_id: seasonId,
        round_id: roundId,
        fixture_id: p.fixture_id,
        actor_id: p.user_id,
        payload: {
          outcome: p.outcome,
          rule: ruleset.defaultPrediction.outcome,
          ruleset_version: ruleset.version,
        },
      })),
    );
  }

  await admin.from("events").insert({
    kind: "round_locked",
    season_id: seasonId,
    round_id: roundId,
    payload: {
      round_number: round.number,
      locked_fixtures: lockedFixtures.length,
      auto_predictions: created.length,
    },
  });

  return {
    roundId,
    lockedFixtures: lockedFixtures.length,
    created: created.length,
    defaultPredictionEnabled: true,
    skipped: false,
  };
}

/** La dernière issue jouée par chaque joueur, sur la saison. */
async function loadLastChoices(
  admin: SupabaseClient,
  seasonId: Uuid,
): Promise<Map<Uuid, MatchOutcome>> {
  const { data: roundRows } = await admin
    .from("rounds")
    .select("id")
    .eq("season_id", seasonId);
  const roundIds = (roundRows ?? []).map((r) => r.id as string);
  if (roundIds.length === 0) return new Map();

  const { data: fixtureRows } = await admin
    .from("fixtures")
    .select("id")
    .in("round_id", roundIds);
  const fixtureIds = (fixtureRows ?? []).map((f) => f.id as string);
  if (fixtureIds.length === 0) return new Map();

  const { data } = await admin
    .from("predictions")
    .select("user_id, outcome, created_at")
    .in("fixture_id", fixtureIds)
    .eq("is_auto", false)
    .order("created_at", { ascending: false });

  const out = new Map<Uuid, MatchOutcome>();
  for (const row of data ?? []) {
    const uid = String(row.user_id);
    if (!out.has(uid)) out.set(uid, row.outcome as MatchOutcome);
  }
  return out;
}

/**
 * Verrouille toutes les journées dont l'heure est venue.
 * C'est le point d'entrée du planificateur : il n'a rien à savoir du calendrier.
 */
export async function applyDefaultPredictionsForDueRounds(
  admin: SupabaseClient,
  opts: { now?: Date } = {},
): Promise<LockRoundReport[]> {
  const now = opts.now ?? new Date();

  const { data: fixtureRows } = await admin
    .from("fixtures")
    .select("round_id")
    .lte("locks_at", now.toISOString());

  const roundIds = Array.from(
    new Set((fixtureRows ?? []).map((f) => String(f.round_id))),
  );

  const reports: LockRoundReport[] = [];
  for (const roundId of roundIds) {
    reports.push(await applyDefaultPredictionsForRound(admin, roundId, { now }));
  }
  return reports;
}
