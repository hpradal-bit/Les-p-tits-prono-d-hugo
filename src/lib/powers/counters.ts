/**
 * Les compteurs de pouvoirs affichés au bas du classement : qui a déjà brûlé
 * quoi, et ce qu'il lui reste.
 *
 * L'assemblage est pur — la lecture de la base se fait ailleurs
 * (`loadSeasonUsageByPlayer`, `loadActivePowers`) — pour qu'il reste testable
 * et que l'écran n'ait plus qu'à peindre.
 */

import type { Power } from "./types.ts";
import { maxUses, FALLBACK_MAX_USES } from "./quota.ts";

export interface CounterCell {
  powerId: string;
  code: string;
  name: string;
  emoji: string;
  used: number;
  max: number;
  remaining: number;
  /** Le quota est épuisé : la pastille s'éteint. */
  exhausted: boolean;
}

export interface CounterRow {
  userId: string;
  /** Le surnom : c'est lui qui distingue les joueurs, pas le prénom. */
  displayName: string;
  cells: CounterCell[];
  totalUsed: number;
  totalRemaining: number;
}

export function buildPowerCounters(
  players: Array<{ userId: string; displayName: string }>,
  powers: Power[],
  usageByPlayer: Map<string, Map<string, number>>,
  fallbackMax = FALLBACK_MAX_USES,
): CounterRow[] {
  // Les pouvoirs dans un ordre stable : une colonne qui bouge d'un joueur à
  // l'autre serait illisible.
  const ordered = [...powers].sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return players
    .map((player) => {
      const counts = usageByPlayer.get(player.userId) ?? new Map<string, number>();
      const cells: CounterCell[] = ordered.map((power) => {
        const max = maxUses(power, fallbackMax);
        const used = counts.get(power.id) ?? 0;
        const remaining = Math.max(0, max - used);
        return {
          powerId: power.id,
          code: power.code,
          name: power.name,
          emoji: power.emoji,
          used,
          max,
          remaining,
          exhausted: remaining === 0,
        };
      });
      return {
        userId: player.userId,
        displayName: player.displayName,
        cells,
        totalUsed: cells.reduce((sum, c) => sum + c.used, 0),
        totalRemaining: cells.reduce((sum, c) => sum + c.remaining, 0),
      };
    })
    .sort((a, b) => b.totalUsed - a.totalUsed || a.displayName.localeCompare(b.displayName, "fr"));
}
