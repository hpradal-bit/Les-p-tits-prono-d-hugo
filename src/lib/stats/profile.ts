/**
 * Fiche statistique d'un joueur — chantier H.
 *
 * Rien n'est recalculé ici de ce que le moteur de classement sait déjà faire :
 * on l'appelle journée par journée (`src/lib/standings/engine`) et on assemble
 * ses réponses en une histoire de saison. Une seule définition des points,
 * du taux de réussite, des ex æquo et des évolutions — la sienne.
 *
 * Fonctions pures : aucune requête, donc testables et rejouables.
 */

import {
  computeStandings,
  playedRounds,
  type PlayerRef,
  type RoundRef,
  type StandingsInput,
  type StandingsRow,
  type StandingsScope,
} from "@/lib/standings/engine";
import type { ScoreLevel, Uuid } from "@/lib/types";
import { streaksBySeason, type PlayerStreaks } from "./streaks";

/** Ce qu'un joueur a fait sur une journée, et où cela l'a mené. */
export interface RoundLine {
  round: RoundRef;
  /** Points de la journée : pronostics + bonus + ajustements rattachés. */
  points: number;
  played: number;
  counts: Record<ScoreLevel, number>;
  /** Place sur la journée (1 = meilleur de la journée). */
  position: number;
  /** Place au classement général après cette journée. */
  overallPosition: number;
  /** Total général cumulé après cette journée. */
  overallPoints: number;
  /** Places gagnées au général depuis la journée précédente. */
  movement: number | null;
}

/** Tout ce qu'affiche la page profil d'un joueur. */
export interface PlayerProfile {
  player: PlayerRef;
  /** Total général, bonus et ajustements compris. */
  points: number;
  /** Place au classement général. */
  rank: number;
  /** Nombre de joueurs classés — pour écrire « 3e sur 6 ». */
  fieldSize: number;
  played: number;
  counts: Record<ScoreLevel, number>;
  /** Part de pronostics rapportant au moins un point. `null` si rien de joué. */
  successRate: number | null;
  /** Bons vainqueurs : tout sauf les ratés. */
  goodWinners: number;
  /** Bons écarts : vainqueur + écart, scores exacts compris. */
  goodMargins: number;
  exactScores: number;
  streaks: PlayerStreaks;
  history: RoundLine[];
  bestRound: RoundLine | null;
  worstRound: RoundLine | null;
  /** Journées terminées dans les N premières places (N = `stats.podium_size`). */
  podiums: number;
  /** Journées gagnées (1re place, ex æquo compris). */
  roundsWon: number;
}

export interface ProfilesOptions {
  scope: StandingsScope;
  /** Nombre de places qui valent un podium de journée (`app_settings`). */
  podiumSize: number;
}

const EMPTY_COUNTS: Record<ScoreLevel, number> = {
  wrong: 0,
  winner: 0,
  winner_and_margin: 0,
  exact_score: 0,
};

function rowOf(rows: StandingsRow[], userId: Uuid): StandingsRow | null {
  return rows.find((r) => r.player.userId === userId) ?? null;
}

/**
 * Construit la fiche de chaque joueur du groupe.
 *
 * Le coût est celui de deux classements par journée jouée : à 6 joueurs et
 * 26 journées, quelques milliers d'opérations. Inutile de figer quoi que ce
 * soit — recalculer reste plus simple, et toujours juste.
 */
export function buildProfiles(
  input: StandingsInput,
  options: ProfilesOptions,
): Map<Uuid, PlayerProfile> {
  const { scope, podiumSize } = options;
  const played = playedRounds(input.rounds, input.entries, scope);
  const streaks = streaksBySeason(input.entries, scope);

  // Une passe par journée, réutilisée pour tous les joueurs.
  const perRound = played.map((round) => ({
    round,
    roundTable: computeStandings(input, { kind: "round", scope, roundId: round.id }),
    overallTable: computeStandings(input, { kind: "overall", scope, roundId: round.id }),
  }));

  const finalTable = computeStandings(input, { kind: "overall", scope });
  const fieldSize = finalTable.rows.length;

  const profiles = new Map<Uuid, PlayerProfile>();

  for (const player of input.players) {
    const id = player.userId;

    const history: RoundLine[] = perRound.map(({ round, roundTable, overallTable }) => {
      const r = rowOf(roundTable.rows, id);
      const o = rowOf(overallTable.rows, id);
      return {
        round,
        points: r?.points ?? 0,
        played: r?.played ?? 0,
        counts: r ? { ...r.counts } : { ...EMPTY_COUNTS },
        position: r?.position ?? fieldSize,
        overallPosition: o?.position ?? fieldSize,
        overallPoints: o?.points ?? 0,
        movement: o?.movement ?? null,
      };
    });

    // Une journée non jouée n'est ni la meilleure ni la pire : on ne juge que
    // ce qui a été joué, sinon un oubli passerait pour une contre-performance.
    const engaged = history.filter((line) => line.played > 0);
    const bestRound = engaged.reduce<RoundLine | null>(
      (best, line) => (best === null || line.points > best.points ? line : best),
      null,
    );
    const worstRound = engaged.reduce<RoundLine | null>(
      (worst, line) => (worst === null || line.points < worst.points ? line : worst),
      null,
    );

    const final = rowOf(finalTable.rows, id);
    const counts = final ? { ...final.counts } : { ...EMPTY_COUNTS };

    profiles.set(id, {
      player,
      points: final?.points ?? 0,
      rank: final?.position ?? fieldSize,
      fieldSize,
      played: final?.played ?? 0,
      counts,
      successRate: final?.successRate ?? null,
      goodWinners: counts.winner + counts.winner_and_margin + counts.exact_score,
      goodMargins: counts.winner_and_margin + counts.exact_score,
      exactScores: counts.exact_score,
      streaks: streaks.get(id) ?? {
        good: { current: 0, best: 0 },
        bad: { current: 0, best: 0 },
      },
      history,
      bestRound,
      worstRound,
      podiums: engaged.filter((line) => line.position <= podiumSize).length,
      roundsWon: engaged.filter((line) => line.position === 1).length,
    });
  }

  return profiles;
}

/** Nombre de pronostics posés automatiquement au verrouillage, par joueur (😴). */
export function countAutoPredictions(
  autoByUser: Iterable<{ userId: Uuid; count: number }>,
): Map<Uuid, number> {
  const out = new Map<Uuid, number>();
  for (const row of autoByUser) out.set(row.userId, (out.get(row.userId) ?? 0) + row.count);
  return out;
}
