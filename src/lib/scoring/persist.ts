import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRuleset } from "../settings/index.ts";
import { computeScore } from "./index.ts";
import type { FixtureResult, Prediction, Ruleset, Uuid } from "../types.ts";

/**
 * Le pont entre le moteur de scoring et la base.
 *
 * Règle non négociable n° 2 : les points ne sont jamais écrits par un client.
 * Ils sont calculés ici, côté serveur, à partir du pronostic, du résultat et
 * du barème — et **rejouables** : relancer le calcul d'une saison entière doit
 * redonner exactement le même résultat.
 *
 * C'est ce qui permet de corriger un score le lundi matin sans que le
 * classement devienne faux ou incohérent.
 */

export interface ScoreRow {
  prediction_id: Uuid;
  points: number;
  breakdown: Record<string, unknown>;
  ruleset_id: Uuid;
  is_official: boolean;
}

export interface RecomputePlan {
  rows: ScoreRow[];
  /** Les joueurs ayant réussi un score exact — matière à événement. */
  exactScorers: Uuid[];
  totalPoints: number;
}

/**
 * La partie pure : à partir des pronostics, du résultat et du barème, ce qu'il
 * faut écrire. Aucun accès base, donc entièrement testable.
 */
export function planFixtureScores(
  predictions: Prediction[],
  result: FixtureResult,
  ruleset: Ruleset,
  isOfficial: boolean,
): RecomputePlan {
  const rows: ScoreRow[] = [];
  const exactScorers: Uuid[] = [];
  let totalPoints = 0;

  for (const prediction of predictions) {
    const outcome = computeScore(prediction, result, ruleset);
    rows.push({
      prediction_id: prediction.id,
      points: outcome.points,
      breakdown: { ...outcome.breakdown, level: outcome.level },
      ruleset_id: ruleset.id,
      is_official: isOfficial,
    });
    totalPoints += outcome.points;
    if (outcome.level === "exact_score") exactScorers.push(prediction.userId);
  }

  return { rows, exactScorers, totalPoints };
}

interface FixtureRow {
  id: Uuid;
  round_id: Uuid;
  home_score: number | null;
  away_score: number | null;
  status: string;
}

function toPrediction(row: Record<string, unknown>): Prediction {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    fixtureId: row.fixture_id as string,
    outcome: row.outcome as Prediction["outcome"],
    marginBucketId: (row.margin_bucket_id as string | null) ?? null,
    marginValue: (row.margin_value as number | null) ?? null,
    exactHomeScore: (row.exact_home_score as number | null) ?? null,
    exactAwayScore: (row.exact_away_score as number | null) ?? null,
    isAuto: Boolean(row.is_auto),
  };
}

export interface RecomputeSummary {
  fixtures: number;
  predictions: number;
  exactScores: number;
  points: number;
  cleared: number;
}

/**
 * Recalcule les points d'une liste de matchs.
 *
 * Un match sans score voit ses points **effacés** plutôt qu'ignorés : si un
 * administrateur annule un résultat saisi par erreur, le classement doit
 * revenir en arrière, pas conserver des points fantômes.
 *
 * @param admin client de service — seul le serveur écrit des points.
 */
export async function recomputeFixtures(
  admin: SupabaseClient,
  fixtureIds: Uuid[],
): Promise<RecomputeSummary> {
  const summary: RecomputeSummary = {
    fixtures: 0, predictions: 0, exactScores: 0, points: 0, cleared: 0,
  };
  if (fixtureIds.length === 0) return summary;

  const { data: fixtures, error } = await admin
    .from("fixtures")
    .select("id, round_id, home_score, away_score, status")
    .in("id", fixtureIds);
  if (error) throw error;

  // Le barème dépend de la saison : on le charge une fois par saison croisée.
  const rulesetBySeason = new Map<Uuid, Ruleset>();

  for (const fixture of (fixtures ?? []) as FixtureRow[]) {
    const { data: predictionRows, error: pErr } = await admin
      .from("predictions")
      .select("id, user_id, fixture_id, outcome, margin_bucket_id, margin_value, exact_home_score, exact_away_score, is_auto")
      .eq("fixture_id", fixture.id);
    if (pErr) throw pErr;

    const predictions = (predictionRows ?? []).map(toPrediction);
    if (predictions.length === 0) continue;

    // Pas de résultat : on efface, on ne laisse pas de points orphelins.
    if (fixture.home_score === null || fixture.away_score === null) {
      const { error: dErr } = await admin
        .from("prediction_scores")
        .delete()
        .in("prediction_id", predictions.map((p) => p.id));
      if (dErr) throw dErr;
      summary.cleared += predictions.length;
      continue;
    }

    const { data: round, error: rErr } = await admin
      .from("rounds").select("season_id").eq("id", fixture.round_id).single();
    if (rErr) throw rErr;

    let ruleset = rulesetBySeason.get(round.season_id);
    if (!ruleset) {
      ruleset = await loadRuleset(admin, round.season_id);
      rulesetBySeason.set(round.season_id, ruleset);
    }

    const plan = planFixtureScores(
      predictions,
      { homeScore: fixture.home_score, awayScore: fixture.away_score },
      ruleset,
      fixture.status === "official",
    );

    const { error: uErr } = await admin
      .from("prediction_scores")
      .upsert(
        plan.rows.map((r) => ({ ...r, computed_at: new Date().toISOString() })),
        { onConflict: "prediction_id" },
      );
    if (uErr) throw uErr;

    await recordExactScoreEvents(admin, fixture, round.season_id, plan.exactScorers);

    summary.fixtures += 1;
    summary.predictions += plan.rows.length;
    summary.exactScores += plan.exactScorers.length;
    summary.points += plan.totalPoints;
  }

  return summary;
}

/** Recalcule toute une journée. */
export async function recomputeRound(
  admin: SupabaseClient,
  roundId: Uuid,
): Promise<RecomputeSummary> {
  const { data, error } = await admin.from("fixtures").select("id").eq("round_id", roundId);
  if (error) throw error;
  return recomputeFixtures(admin, (data ?? []).map((f) => f.id as string));
}

/**
 * Un score exact écrit un événement — le fil social, les badges et les
 * notifications le liront (règle n° 8). Le recalcul étant rejouable, on ne
 * réécrit jamais un événement déjà présent : sinon rejouer une saison
 * inonderait le Vestiaire.
 */
async function recordExactScoreEvents(
  admin: SupabaseClient,
  fixture: FixtureRow,
  seasonId: Uuid,
  scorers: Uuid[],
): Promise<void> {
  if (scorers.length === 0) return;

  const { data: existing } = await admin
    .from("events")
    .select("actor_id")
    .eq("kind", "exact_score")
    .eq("fixture_id", fixture.id);

  const already = new Set((existing ?? []).map((e) => e.actor_id as string));
  const missing = scorers.filter((id) => !already.has(id));
  if (missing.length === 0) return;

  await admin.from("events").insert(
    missing.map((userId) => ({
      kind: "exact_score",
      season_id: seasonId,
      round_id: fixture.round_id,
      fixture_id: fixture.id,
      actor_id: userId,
      payload: { home_score: fixture.home_score, away_score: fixture.away_score },
    })),
  );
}
