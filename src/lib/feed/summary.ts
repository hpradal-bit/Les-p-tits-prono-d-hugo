/**
 * Calcul des valeurs du résumé de journée — pur, testable sans base.
 *
 * Le gabarit vit dans `app_settings` (`feed.round_summary_template`), et
 * `fillSummary` (dans `render.ts`) remplit les trous. Ici on fabrique le
 * dictionnaire de valeurs à partir du classement de la journée, du
 * classement général, et des matchs.
 */

import type { StandingsRow, StandingsTable } from "@/lib/standings/engine";
import type { ScoreLevel } from "@/lib/types";

export interface SummaryFixture {
  homeTeam: string;
  awayTeam: string;
  /** Nombre de joueurs ayant pronostiqué le mauvais vainqueur. */
  wrongCount: number;
}

export interface SummaryInput {
  roundName: string;
  roundNumber: number;
  /** Classement de la journée seule. */
  roundStandings: StandingsTable;
  /** Classement général après cette journée. */
  overallStandings: StandingsTable;
  /** Les matchs avec le nombre d'erreurs par match. */
  fixtures: SummaryFixture[];
}

export type SummaryValues = Record<string, string | number | null>;

export function computeSummaryValues(input: SummaryInput): SummaryValues {
  const { roundStandings, overallStandings, fixtures } = input;

  const leader = overallStandings.rows[0] ?? null;
  const bestOfRound = roundStandings.rows[0] ?? null;

  const biggestDrop = findBiggestDrop(overallStandings.rows);

  const totalByLevel = countLevels(roundStandings.rows);
  const worstMatch = findWorstPredictedMatch(fixtures);

  return {
    n: input.roundNumber,
    round: input.roundName,

    leader: leader?.player.firstName ?? null,
    pts: leader?.points ?? null,

    meilleur_joueur: bestOfRound?.player.firstName ?? null,
    pts_j: bestOfRound?.points ?? null,

    plus_grosse_chute: biggestDrop?.player.firstName ?? null,
    avant: biggestDrop?.previousPosition ?? null,
    apres: biggestDrop?.position ?? null,

    n_exacts: totalByLevel.exact_score,
    n_vainqueurs: totalByLevel.winner + totalByLevel.winner_and_margin + totalByLevel.exact_score,

    match: worstMatch?.label ?? null,
    n_erreurs: worstMatch?.wrongCount ?? null,
  };
}

function findBiggestDrop(
  rows: StandingsRow[],
): StandingsRow | null {
  let worst: StandingsRow | null = null;
  let worstDrop = 0;

  for (const row of rows) {
    if (row.movement === null || row.previousPosition === null) continue;
    if (row.movement >= 0) continue;
    const drop = -row.movement;
    if (drop > worstDrop) {
      worstDrop = drop;
      worst = row;
    }
  }

  return worst;
}

function countLevels(rows: StandingsRow[]): Record<ScoreLevel, number> {
  const totals: Record<ScoreLevel, number> = {
    wrong: 0,
    winner: 0,
    winner_and_margin: 0,
    exact_score: 0,
  };

  for (const row of rows) {
    for (const level of Object.keys(totals) as ScoreLevel[]) {
      totals[level] += row.counts[level];
    }
  }

  return totals;
}

function findWorstPredictedMatch(
  fixtures: SummaryFixture[],
): { label: string; wrongCount: number } | null {
  if (fixtures.length === 0) return null;

  let worst = fixtures[0];
  for (const f of fixtures) {
    if (f.wrongCount > worst.wrongCount) worst = f;
  }

  if (worst.wrongCount === 0) return null;

  return {
    label: `${worst.homeTeam} - ${worst.awayTeam}`,
    wrongCount: worst.wrongCount,
  };
}
