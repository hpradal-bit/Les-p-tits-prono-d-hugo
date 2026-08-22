/**
 * Moteur de classement — pur, déterministe, rejouable.
 *
 * Un seul moteur, deux filtres (cf. docs/00-AUDIT.md, décision 5) :
 *   • portée « live »     → tous les matchs pronostiqués sont comptés ;
 *   • portée « officiel » → seuls les matchs au statut `official` comptent.
 *
 * Trois classements, la même mécanique, seule la fenêtre de journées change :
 *   • `round`   → une journée ;
 *   • `overall` → toutes les journées jouées jusqu'à la journée de référence ;
 *   • `form`    → les N dernières journées jouées (5 par défaut).
 *
 * Aucun accès à la base ici : ce fichier ne dépend que de ses entrées, ce qui
 * le rend testable et rejouable à l'identique.
 */

import type { FixtureStatus, ScoreLevel, Uuid } from "@/lib/types";

export type StandingsScope = "live" | "official";
export type StandingsKind = "round" | "overall" | "form";

/** Le nombre de journées prises en compte par le classement « forme ». */
export const DEFAULT_FORM_WINDOW = 5;

/** Un pronostic déjà noté, tel qu'il entre dans le classement. */
export interface ScoreEntry {
  userId: Uuid;
  roundId: Uuid;
  fixtureId: Uuid;
  /** Sert à ordonner la série en cours : ISO 8601. */
  kickoffAt: string;
  fixtureStatus: FixtureStatus;
  points: number;
  level: ScoreLevel;
}

/** Duel, correction admin, bonus manuel : tout ce qui n'est pas un pronostic. */
export interface AdjustmentEntry {
  userId: Uuid;
  roundId: Uuid | null; // null = ajustement de saison
  delta: number;
}

/** Points d'une question bonus. */
export interface BonusEntry {
  userId: Uuid;
  roundId: Uuid | null; // null = question de saison
  points: number;
}

export interface PlayerRef {
  userId: Uuid;
  firstName: string;
  displayName: string;
  avatarKind: "emoji" | "photo" | "club";
  avatarValue: string;
}

export interface RoundRef {
  id: Uuid;
  number: number;
  name: string;
}

/** Série en cours : bons pronostics d'affilée, ou ratés d'affilée. */
export interface StreakInfo {
  kind: "good" | "bad";
  length: number;
}

export interface StandingsRow {
  position: number;
  player: PlayerRef;
  /** Total affiché : pronostics + bonus + ajustements. */
  points: number;
  predictionPoints: number;
  bonusPoints: number;
  adjustmentPoints: number;
  /** Nombre de pronostics notés dans la fenêtre. */
  played: number;
  counts: Record<ScoreLevel, number>;
  /** Part de pronostics rapportant au moins un point. `null` si rien de joué. */
  successRate: number | null;
  /** Série en cours, calculée sur toute la saison jusqu'à la journée de référence. */
  streak: StreakInfo | null;
  previousPosition: number | null;
  /** Places gagnées depuis la journée précédente ( > 0 = remontée ). */
  movement: number | null;
}

export interface StandingsTable {
  kind: StandingsKind;
  scope: StandingsScope;
  /** Journées effectivement comptées, de la plus ancienne à la plus récente. */
  roundIds: Uuid[];
  referenceRoundId: Uuid | null;
  previousRoundId: Uuid | null;
  rows: StandingsRow[];
}

export interface StandingsInput {
  players: PlayerRef[];
  rounds: RoundRef[];
  entries: ScoreEntry[];
  adjustments: AdjustmentEntry[];
  bonuses: BonusEntry[];
}

export interface StandingsOptions {
  kind: StandingsKind;
  scope: StandingsScope;
  /** Journée de référence. Par défaut : la dernière journée comptée. */
  roundId?: Uuid | null;
  /** Taille de la fenêtre du classement « forme ». */
  formWindow?: number;
}

const EMPTY_COUNTS: Record<ScoreLevel, number> = {
  wrong: 0,
  winner: 0,
  winner_and_margin: 0,
  exact_score: 0,
};

/** Le filtre de portée : c'est tout ce qui sépare le live de l'officiel. */
export function matchesScope(entry: ScoreEntry, scope: StandingsScope): boolean {
  if (scope === "official") return entry.fixtureStatus === "official";
  // Live : un match reporté ou annulé ne rapporte rien tant qu'il n'est pas joué.
  return entry.fixtureStatus !== "postponed" && entry.fixtureStatus !== "cancelled";
}

/**
 * Les journées qui comptent, dans l'ordre : celles où au moins un pronostic a
 * été noté dans la portée demandée. Une journée sans résultat n'existe pas
 * encore pour le classement.
 */
export function playedRounds(
  rounds: RoundRef[],
  entries: ScoreEntry[],
  scope: StandingsScope,
): RoundRef[] {
  const withScores = new Set(
    entries.filter((e) => matchesScope(e, scope)).map((e) => e.roundId),
  );
  return [...rounds]
    .sort((a, b) => a.number - b.number)
    .filter((r) => withScores.has(r.id));
}

/** La fenêtre de journées d'un classement, en fonction de son type. */
function windowFor(
  kind: StandingsKind,
  played: RoundRef[],
  referenceIndex: number,
  formWindow: number,
): Uuid[] {
  if (referenceIndex < 0) return [];
  switch (kind) {
    case "round":
      return [played[referenceIndex].id];
    case "form": {
      const size = Math.max(1, formWindow);
      const start = Math.max(0, referenceIndex - size + 1);
      return played.slice(start, referenceIndex + 1).map((r) => r.id);
    }
    case "overall":
    default:
      return played.slice(0, referenceIndex + 1).map((r) => r.id);
  }
}

interface Tally {
  predictionPoints: number;
  bonusPoints: number;
  adjustmentPoints: number;
  played: number;
  counts: Record<ScoreLevel, number>;
  correct: number;
}

function emptyTally(): Tally {
  return {
    predictionPoints: 0,
    bonusPoints: 0,
    adjustmentPoints: 0,
    played: 0,
    counts: { ...EMPTY_COUNTS },
    correct: 0,
  };
}

/**
 * Ordre du classement. Départages, du plus au moins déterminant :
 *   1. le total de points ;
 *   2. le nombre de scores exacts ;
 *   3. le nombre de vainqueurs + écart ;
 *   4. le nombre de pronostics réussis (au moins un point) ;
 *   5. le prénom, pour que deux ex æquo sortent toujours dans le même ordre.
 *
 * Les quatre premiers critères décident de la place ; le cinquième ne fait
 * qu'ordonner l'affichage : deux joueurs égaux partagent la même position.
 */
function rankKey(row: {
  points: number;
  counts: Record<ScoreLevel, number>;
  correct: number;
}): number[] {
  return [row.points, row.counts.exact_score, row.counts.winner_and_margin, row.correct];
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return 0;
}

/** La série en cours d'un joueur : bons pronostics, ou ratés, d'affilée. */
export function currentStreak(entries: ScoreEntry[]): StreakInfo | null {
  if (entries.length === 0) return null;
  const ordered = [...entries].sort((a, b) => {
    if (a.kickoffAt !== b.kickoffAt) return a.kickoffAt < b.kickoffAt ? -1 : 1;
    return a.fixtureId < b.fixtureId ? -1 : a.fixtureId > b.fixtureId ? 1 : 0;
  });
  const last = ordered[ordered.length - 1];
  const kind: StreakInfo["kind"] = last.level === "wrong" ? "bad" : "good";
  let length = 0;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const isGood = ordered[i].level !== "wrong";
    if ((kind === "good") !== isGood) break;
    length += 1;
  }
  return { kind, length };
}

interface RawRow {
  player: PlayerRef;
  tally: Tally;
  points: number;
  streak: StreakInfo | null;
}

function buildRows(
  input: StandingsInput,
  scope: StandingsScope,
  windowIds: Uuid[],
  /** Journées cumulées jusqu'à la référence : sert à la série en cours. */
  historyIds: Uuid[],
  includeSeasonWide: boolean,
): RawRow[] {
  const inWindow = new Set(windowIds);
  const inHistory = new Set(historyIds);

  const tallies = new Map<Uuid, Tally>();
  const history = new Map<Uuid, ScoreEntry[]>();
  for (const p of input.players) {
    tallies.set(p.userId, emptyTally());
    history.set(p.userId, []);
  }

  for (const entry of input.entries) {
    if (!matchesScope(entry, scope)) continue;
    const tally = tallies.get(entry.userId);
    if (!tally) continue; // joueur inactif ou hors groupe : ignoré
    if (inHistory.has(entry.roundId)) history.get(entry.userId)!.push(entry);
    if (!inWindow.has(entry.roundId)) continue;
    tally.predictionPoints += entry.points;
    tally.played += 1;
    tally.counts[entry.level] += 1;
    if (entry.level !== "wrong") tally.correct += 1;
  }

  for (const adj of input.adjustments) {
    const tally = tallies.get(adj.userId);
    if (!tally) continue;
    const counted = adj.roundId === null ? includeSeasonWide : inWindow.has(adj.roundId);
    if (counted) tally.adjustmentPoints += adj.delta;
  }

  for (const bonus of input.bonuses) {
    const tally = tallies.get(bonus.userId);
    if (!tally) continue;
    const counted = bonus.roundId === null ? includeSeasonWide : inWindow.has(bonus.roundId);
    if (counted) tally.bonusPoints += bonus.points;
  }

  return input.players.map((player) => {
    const tally = tallies.get(player.userId)!;
    return {
      player,
      tally,
      points: tally.predictionPoints + tally.bonusPoints + tally.adjustmentPoints,
      streak: currentStreak(history.get(player.userId)!),
    };
  });
}

function positionsOf(rows: RawRow[]): Map<Uuid, number> {
  const sorted = [...rows].sort((a, b) => {
    const byScore = compareKeys(
      rankKey({ points: a.points, counts: a.tally.counts, correct: a.tally.correct }),
      rankKey({ points: b.points, counts: b.tally.counts, correct: b.tally.correct }),
    );
    if (byScore !== 0) return byScore;
    const byName = a.player.firstName.localeCompare(b.player.firstName, "fr");
    if (byName !== 0) return byName;
    return a.player.userId < b.player.userId ? -1 : a.player.userId > b.player.userId ? 1 : 0;
  });

  const positions = new Map<Uuid, number>();
  let position = 0;
  let previousKey: number[] | null = null;
  sorted.forEach((row, index) => {
    const key = rankKey({
      points: row.points,
      counts: row.tally.counts,
      correct: row.tally.correct,
    });
    // Ex æquo : même place, et on saute les places suivantes (1, 1, 3…).
    if (previousKey === null || compareKeys(previousKey, key) !== 0) position = index + 1;
    previousKey = key;
    positions.set(row.player.userId, position);
  });
  return positions;
}

/**
 * Calcule un classement. La journée précédente est recalculée avec le même
 * moteur pour en déduire l'évolution : aucune donnée figée n'est nécessaire.
 */
export function computeStandings(
  input: StandingsInput,
  options: StandingsOptions,
): StandingsTable {
  const { kind, scope } = options;
  const formWindow = options.formWindow ?? DEFAULT_FORM_WINDOW;
  const played = playedRounds(input.rounds, input.entries, scope);

  let referenceIndex = played.length - 1;
  if (options.roundId) {
    // Une journée sans aucun résultat n'a pas de classement : on n'invente rien.
    referenceIndex = played.findIndex((r) => r.id === options.roundId);
  }

  const windowIds = windowFor(kind, played, referenceIndex, formWindow);
  const historyIds =
    referenceIndex >= 0 ? played.slice(0, referenceIndex + 1).map((r) => r.id) : [];
  // Les ajustements et bonus de saison n'appartiennent à aucune journée :
  // ils ne pèsent que sur le classement général à jour.
  const includeSeasonWide = kind === "overall" && referenceIndex === played.length - 1;

  const rows = buildRows(input, scope, windowIds, historyIds, includeSeasonWide);
  const positions = positionsOf(rows);

  let previousPositions: Map<Uuid, number> | null = null;
  if (referenceIndex > 0) {
    const previousWindow = windowFor(kind, played, referenceIndex - 1, formWindow);
    const previousHistory = played.slice(0, referenceIndex).map((r) => r.id);
    previousPositions = positionsOf(
      buildRows(input, scope, previousWindow, previousHistory, includeSeasonWide),
    );
  }

  const finalRows: StandingsRow[] = rows
    .map((row) => {
      const position = positions.get(row.player.userId)!;
      const previousPosition = previousPositions?.get(row.player.userId) ?? null;
      return {
        position,
        player: row.player,
        points: row.points,
        predictionPoints: row.tally.predictionPoints,
        bonusPoints: row.tally.bonusPoints,
        adjustmentPoints: row.tally.adjustmentPoints,
        played: row.tally.played,
        counts: { ...row.tally.counts },
        successRate: row.tally.played > 0 ? row.tally.correct / row.tally.played : null,
        streak: row.streak,
        previousPosition,
        movement: previousPosition === null ? null : previousPosition - position,
      };
    })
    .sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      const byName = a.player.firstName.localeCompare(b.player.firstName, "fr");
      if (byName !== 0) return byName;
      return a.player.userId < b.player.userId ? -1 : 1;
    });

  return {
    kind,
    scope,
    roundIds: windowIds,
    referenceRoundId: referenceIndex >= 0 ? played[referenceIndex].id : null,
    previousRoundId: referenceIndex > 0 ? played[referenceIndex - 1].id : null,
    rows: finalRows,
  };
}
