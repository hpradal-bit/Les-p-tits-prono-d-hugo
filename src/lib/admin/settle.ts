"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./auth";
import { currentSeasonId } from "./queries";
import { logAdminAction } from "./log";
import type { AdminActionState } from "./types";
import { recomputeRound } from "@/lib/scoring/persist";
import { resolveRoundPowers } from "@/lib/powers/actions";
import { loadStandingsData, loadActiveSeason } from "@/lib/standings/queries";
import { computeStandings } from "@/lib/standings/engine";
import { computeSummaryValues, type SummaryFixture } from "@/lib/feed/summary";
import { fillSummary } from "@/lib/feed/render";
import { loadSettings, setting } from "@/lib/settings";
import { awardRoundBadges } from "@/lib/badges/actions";
import { streaksBySeason } from "@/lib/stats/streaks";
import { persistStreaks } from "@/lib/stats/persist";

export async function settleRound(
  roundId: string,
): Promise<AdminActionState> {
  const ctx = await requireAdmin();
  const admin = createAdminClient();
  const seasonId = await currentSeasonId(admin);

  const { data: round } = await admin
    .from("rounds")
    .select("id, number, name, status")
    .eq("id", roundId)
    .single();
  if (!round) return { status: "error", message: "Journée introuvable." };
  if ((round.status as string) === "settled") {
    return { status: "error", message: "Cette journée est déjà clôturée." };
  }

  const { data: fixtureRows } = await admin
    .from("fixtures")
    .select("id, status")
    .eq("round_id", roundId);
  const allFinished = (fixtureRows ?? []).every(
    (f) => f.status === "finished" || f.status === "official" || f.status === "cancelled",
  );
  if (!allFinished) {
    return { status: "error", message: "Tous les matchs ne sont pas terminés." };
  }

  // 1. Recalcul des scores
  const scoreSummary = await recomputeRound(admin, roundId);

  // 2. Résolution des pouvoirs
  await resolveRoundPowers(roundId);

  // 3. Badges et séries — même modèle que les pouvoirs : une fonction pure
  // décide, la clôture écrit et publie l'événement que le Vestiaire raconte.
  const badgeSummary = await awardRoundBadges(roundId);
  await persistRoundStreaks(admin, seasonId);

  // 4. Résumé de journée
  const summaryLines = await generateRoundSummary(admin, seasonId, roundId, round.number as number, round.name as string);

  // 5. Événement round_settled avec le résumé dans le payload
  await admin.from("events").insert({
    kind: "round_settled",
    season_id: seasonId,
    round_id: roundId,
    payload: {
      round_name: round.name,
      round_number: round.number,
      summary: summaryLines,
    },
  });

  // 6. Transition de statut
  await admin
    .from("rounds")
    .update({ status: "settled", settled_at: new Date().toISOString() })
    .eq("id", roundId);

  // 7. Snapshot du classement dans standings_snapshots
  await saveStandingsSnapshot(admin, seasonId, roundId);

  // 8. Journal admin
  await logAdminAction(admin, {
    adminId: ctx.userId,
    action: "round.settled",
    entityType: "round",
    entityId: roundId,
    reason: `Clôture de la ${round.name}`,
    after: {
      fixtures_scored: scoreSummary.fixtures,
      predictions_scored: scoreSummary.predictions,
      exact_scores: scoreSummary.exactScores,
    },
    event: { seasonId, roundId },
  });

  revalidatePath("/journee");
  revalidatePath("/classement");
  revalidatePath("/vestiaire");

  return {
    status: "success",
    message: `${round.name} clôturée.`,
    details: [
      `${scoreSummary.fixtures} matchs, ${scoreSummary.predictions} pronostics notés`,
      `${scoreSummary.exactScores} score(s) exact(s)`,
      ...(badgeSummary.message && !badgeSummary.message.startsWith("Aucun") ? [badgeSummary.message] : []),
      ...(summaryLines.length > 0 ? ["Résumé publié dans le Vestiaire"] : []),
    ],
  };
}

async function generateRoundSummary(
  admin: ReturnType<typeof createAdminClient>,
  seasonId: string,
  roundId: string,
  roundNumber: number,
  roundName: string,
): Promise<string[]> {
  const season = await loadActiveSeason(admin);
  if (!season) return [];

  const data = await loadStandingsData(admin, season);

  const roundStandings = computeStandings(data, {
    kind: "round",
    scope: "official",
    roundId,
  });

  const overallStandings = computeStandings(data, {
    kind: "overall",
    scope: "official",
    roundId,
  });

  const fixtures = await buildSummaryFixtures(admin, roundId, data);

  const values = computeSummaryValues({
    roundName,
    roundNumber,
    roundStandings,
    overallStandings,
    fixtures,
  });

  const settings = await loadSettings(admin);
  const template = setting<string[]>(settings, "feed.round_summary_template", []);

  return fillSummary(template, values);
}

async function buildSummaryFixtures(
  admin: ReturnType<typeof createAdminClient>,
  roundId: string,
  data: Awaited<ReturnType<typeof loadStandingsData>>,
): Promise<SummaryFixture[]> {
  const { data: fixtures } = await admin
    .from("fixtures")
    .select("id, home_team_id, away_team_id, home_score, away_score")
    .eq("round_id", roundId);
  if (!fixtures || fixtures.length === 0) return [];

  const teamIds = [...new Set((fixtures as Array<{ home_team_id: string; away_team_id: string }>).flatMap((f) => [f.home_team_id, f.away_team_id]))];
  const { data: teams } = await admin
    .from("teams")
    .select("id, short_name")
    .in("id", teamIds);
  const teamMap = new Map((teams ?? []).map((t) => [t.id as string, t.short_name as string]));

  const { data: predictions } = await admin
    .from("predictions")
    .select("fixture_id, outcome")
    .in("fixture_id", (fixtures as Array<{ id: string }>).map((f) => f.id));

  return (fixtures as Array<{
    id: string;
    home_team_id: string;
    away_team_id: string;
    home_score: number | null;
    away_score: number | null;
  }>).map((f) => {
    const h = f.home_score ?? 0;
    const a = f.away_score ?? 0;
    const actualOutcome = h > a ? "home" : h < a ? "away" : "draw";
    const preds = (predictions ?? []).filter((p) => (p.fixture_id as string) === f.id);
    const wrongCount = preds.filter((p) => (p.outcome as string) !== actualOutcome).length;

    return {
      homeTeam: teamMap.get(f.home_team_id) ?? "?",
      awayTeam: teamMap.get(f.away_team_id) ?? "?",
      wrongCount,
    };
  });
}

async function saveStandingsSnapshot(
  admin: ReturnType<typeof createAdminClient>,
  seasonId: string,
  roundId: string,
): Promise<void> {
  const season = await loadActiveSeason(admin);
  if (!season) return;

  const data = await loadStandingsData(admin, season);

  for (const kind of ["round", "overall"] as const) {
    const table = computeStandings(data, { kind, scope: "official", roundId });
    await admin.from("standings_snapshots").upsert(
      {
        season_id: seasonId,
        round_id: roundId,
        kind,
        standings: table.rows,
        frozen_at: new Date().toISOString(),
      },
      { onConflict: "season_id,round_id,kind" },
    );
  }
}

/**
 * Reconstruit les séries de toute la saison et les écrit dans `streaks`.
 *
 * Même portée « officiel » que le classement figé et les badges au même
 * instant : les trois racontent la même journée. La table n'est qu'un cache —
 * on la recalcule entièrement plutôt que de tenter une mise à jour
 * incrémentale, à ce nombre de joueurs et de journées le coût est négligeable.
 */
async function persistRoundStreaks(
  admin: ReturnType<typeof createAdminClient>,
  seasonId: string,
): Promise<void> {
  const season = await loadActiveSeason(admin);
  if (!season) return;

  const data = await loadStandingsData(admin, season);
  const streaks = streaksBySeason(data.entries, "official");
  await persistStreaks(admin, streaks, seasonId);
}
