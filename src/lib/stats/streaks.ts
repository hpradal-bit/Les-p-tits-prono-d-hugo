/**
 * Séries — chantier H.
 *
 * Le moteur de classement sait déjà dire la série *en cours* (`currentStreak`).
 * Il manquait le *record* : c'est tout ce que ce fichier ajoute, en réutilisant
 * exactement le même ordre chronologique et la même définition d'un bon
 * pronostic (rapporter au moins un point, donc n'être pas au niveau `wrong`).
 *
 * Fonctions pures : mêmes entrées, mêmes sorties, testables et rejouables.
 */

import type { ScoreEntry, StandingsScope } from "@/lib/standings/engine";
import { currentStreak, matchesScope } from "@/lib/standings/engine";
import type { Uuid } from "@/lib/types";

/** Les deux natures de série suivies par le jeu. */
export type StreakKind = "good" | "bad";

/** Le nom de la série tel qu'il est stocké dans la table `streaks`. */
export const STREAK_DB_KIND: Record<StreakKind, string> = {
  good: "good_prediction",
  bad: "bad_prediction",
};

export interface StreakValue {
  /** Longueur de la série en cours (0 si la dernière n'est pas de ce type). */
  current: number;
  /** Le record de la saison. */
  best: number;
}

export interface PlayerStreaks {
  good: StreakValue;
  bad: StreakValue;
}

/** Ordre chronologique stable : coup d'envoi, puis identifiant du match. */
export function chronological(entries: ScoreEntry[]): ScoreEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kickoffAt !== b.kickoffAt) return a.kickoffAt < b.kickoffAt ? -1 : 1;
    return a.fixtureId < b.fixtureId ? -1 : a.fixtureId > b.fixtureId ? 1 : 0;
  });
}

/** Un pronostic réussi : tout sauf le mauvais vainqueur. */
export function isGood(entry: ScoreEntry): boolean {
  return entry.level !== "wrong";
}

/**
 * Record et série en cours pour une suite booléenne déjà ordonnée dans le temps.
 * Séparée du reste pour être testable seule : c'est le cœur du calcul.
 */
export function streakOf(flags: boolean[]): StreakValue {
  let best = 0;
  let run = 0;
  for (const flag of flags) {
    run = flag ? run + 1 : 0;
    if (run > best) best = run;
  }
  let current = 0;
  for (let i = flags.length - 1; i >= 0 && flags[i]; i -= 1) current += 1;
  return { current, best };
}

/** Les deux séries d'un joueur, à partir de ses pronostics notés. */
export function playerStreaks(entries: ScoreEntry[]): PlayerStreaks {
  const ordered = chronological(entries);
  return {
    good: streakOf(ordered.map(isGood)),
    bad: streakOf(ordered.map((e) => !isGood(e))),
  };
}

/**
 * Les séries de tous les joueurs, à partir des pronostics d'une saison.
 * Le filtre de portée est celui du moteur de classement : une seule définition
 * de « ce match compte », partagée par le classement et par les séries.
 */
export function streaksBySeason(
  entries: ScoreEntry[],
  scope: StandingsScope,
): Map<Uuid, PlayerStreaks> {
  const byPlayer = new Map<Uuid, ScoreEntry[]>();
  for (const entry of entries) {
    if (!matchesScope(entry, scope)) continue;
    const list = byPlayer.get(entry.userId);
    if (list) list.push(entry);
    else byPlayer.set(entry.userId, [entry]);
  }

  const out = new Map<Uuid, PlayerStreaks>();
  for (const [userId, list] of byPlayer) out.set(userId, playerStreaks(list));
  return out;
}

/**
 * La série en cours au format du moteur de classement — réexportée pour que
 * les écrans du chantier H aient un seul point d'entrée.
 */
export { currentStreak };
