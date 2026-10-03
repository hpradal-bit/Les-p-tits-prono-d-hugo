/**
 * Lecture serveur pour la vue « en direct » d'un Duel (`computeDuelBattle`,
 * dans `battle.ts`) — toujours avec le client admin, jamais un client soumis
 * à RLS : un joueur doit pouvoir lire les points de SON adversaire sur la
 * journée en cours, ce que le pronostic de l'autre (règle n° 3) interdit
 * normalement. C'est la même dérogation serveur que `loadSpyReveal` (cf.
 * `queries.ts`) — jamais exposée telle quelle à un client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FixtureStatus, Prediction as ScoringPrediction, Ruleset, Uuid } from "@/lib/types";
import { computeDuelBattle, type DuelBattle, type BattleLiveContribution } from "./battle.ts";
import { loadRoundTotals } from "./queries.ts";
import { loadRulesetAt } from "@/lib/settings";
import { computeLivePreview } from "@/lib/scoring/live-preview";

interface RawFixtureRow {
  id: string;
  status: FixtureStatus;
  home_score: number | null;
  away_score: number | null;
  kickoff_at: string;
  locks_at: string;
}

interface RawPredictionRow {
  id: string;
  user_id: string;
  fixture_id: string;
  outcome: ScoringPrediction["outcome"];
  margin_bucket_id: string | null;
  margin_value: number | null;
  exact_home_score: number | null;
  exact_away_score: number | null;
  is_auto: boolean;
}

export async function loadDuelBattle(
  admin: SupabaseClient,
  seasonId: Uuid,
  roundId: Uuid,
  initiatorId: Uuid,
  targetId: Uuid,
): Promise<DuelBattle> {
  const [fixturesRes, officialPoints] = await Promise.all([
    admin
      .from("fixtures")
      .select("id, status, home_score, away_score, kickoff_at, locks_at")
      .eq("round_id", roundId),
    loadRoundTotals(admin, roundId),
  ]);
  if (fixturesRes.error) throw fixturesRes.error;

  const fixtures = (fixturesRes.data ?? []) as RawFixtureRow[];
  const liveFixtures = fixtures.filter(
    (f) =>
      (f.status === "live" || f.status === "halftime") &&
      f.home_score !== null &&
      f.away_score !== null,
  );

  const liveContributions: BattleLiveContribution[] = [];

  if (liveFixtures.length > 0) {
    const { data: predictionRows, error: predictionsError } = await admin
      .from("predictions")
      .select(
        "id, user_id, fixture_id, outcome, margin_bucket_id, margin_value, exact_home_score, exact_away_score, is_auto",
      )
      .in("fixture_id", liveFixtures.map((f) => f.id))
      .in("user_id", [initiatorId, targetId]);
    if (predictionsError) throw predictionsError;

    const predictions = (predictionRows ?? []) as RawPredictionRow[];

    if (predictions.length > 0) {
      // Un pronostic déjà noté officiellement ne reçoit jamais d'aperçu en
      // plus — même garde-fou que `loadSeasonLivePreview` (standings/queries.ts).
      const { data: scoredRows, error: scoredError } = await admin
        .from("prediction_scores")
        .select("prediction_id")
        .in("prediction_id", predictions.map((p) => p.id));
      if (scoredError) throw scoredError;
      const alreadyScored = new Set(
        ((scoredRows ?? []) as Array<{ prediction_id: string }>).map((r) => r.prediction_id),
      );

      const rulesetByFixture = new Map<string, Ruleset>();
      for (const fixture of liveFixtures) {
        const relevant = predictions.filter(
          (p) => p.fixture_id === fixture.id && !alreadyScored.has(p.id),
        );
        if (relevant.length === 0) continue;

        let ruleset = rulesetByFixture.get(fixture.id);
        if (!ruleset) {
          ruleset = await loadRulesetAt(admin, seasonId, new Date(fixture.locks_at));
          rulesetByFixture.set(fixture.id, ruleset);
        }

        for (const p of relevant) {
          const preview = computeLivePreview(
            {
              id: p.id,
              userId: p.user_id,
              fixtureId: p.fixture_id,
              outcome: p.outcome,
              marginBucketId: p.margin_bucket_id,
              marginValue: p.margin_value,
              exactHomeScore: p.exact_home_score,
              exactAwayScore: p.exact_away_score,
              isAuto: p.is_auto,
            } satisfies ScoringPrediction,
            { homeScore: fixture.home_score!, awayScore: fixture.away_score! },
            ruleset,
          );
          liveContributions.push({ userId: p.user_id, fixtureId: p.fixture_id, points: preview.points });
        }
      }
    }
  }

  return computeDuelBattle({
    initiatorId,
    targetId,
    fixtures: fixtures.map((f) => ({ id: f.id, status: f.status })),
    officialPoints,
    liveContributions,
  });
}
