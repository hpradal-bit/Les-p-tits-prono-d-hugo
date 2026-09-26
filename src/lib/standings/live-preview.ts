/**
 * Classement EN DIRECT — un calque additif, purement calculé à la lecture,
 * jamais persisté et jamais mêlé à `league_standings_cache`/`prediction_scores`.
 *
 * Le classement officiel (`computeStandings`, `engine.ts`) ne bouge que quand
 * un pronostic est réellement noté (match `official`). Ce module ajoute
 * PAR-DESSUS, pour l'affichage seulement, les points que chaque joueur
 * gagnerait SI les matchs actuellement `live`/`halftime` s'arrêtaient là —
 * calculés avec `computeLivePreview` (`scoring/live-preview.ts`), donc avec le
 * même barème que le calcul officiel.
 *
 * Sans match en direct, `applyLivePreview` renvoie le classement officiel tel
 * quel, avec `hasLivePreview: false` : l'écran ne doit alors montrer aucun
 * badge « provisoire ».
 */

import type { StandingsRow, StandingsTable } from "./engine.ts";
import type { Uuid } from "@/lib/types";

export interface LivePreviewContribution {
  userId: Uuid;
  fixtureId: Uuid;
  /** Ce que ce pronostic vaudrait si le score en direct devenait officiel. */
  points: number;
}

export interface LiveStandingsRow extends StandingsRow {
  /** Points d'aperçu en direct déjà ajoutés à `points` ci-dessus (0 si aucun match en direct). */
  livePreviewPoints: number;
}

export interface LiveStandingsTable extends Omit<StandingsTable, "rows"> {
  rows: LiveStandingsRow[];
  /** Y a-t-il au moins un match en direct dont l'aperçu a été ajouté ? */
  hasLivePreview: boolean;
}

/**
 * Ajoute l'aperçu en direct par-dessus un classement déjà calculé.
 *
 * Le classement est réordonné uniquement par le nouveau total : c'est un
 * aperçu, pas une décision, les départages fins de `engine.ts` (score exact,
 * réussite...) ne sont pas recalculés — inutile pour quelque chose qui « se
 * confirmera à la fin du match ».
 */
export function applyLivePreview(
  table: StandingsTable,
  contributions: LivePreviewContribution[],
): LiveStandingsTable {
  const byUser = new Map<Uuid, number>();
  for (const c of contributions) {
    byUser.set(c.userId, (byUser.get(c.userId) ?? 0) + c.points);
  }

  if (byUser.size === 0) {
    return {
      ...table,
      rows: table.rows.map((row) => ({ ...row, livePreviewPoints: 0 })),
      hasLivePreview: false,
    };
  }

  const withPreview: LiveStandingsRow[] = table.rows.map((row) => {
    const bonus = byUser.get(row.player.userId) ?? 0;
    return { ...row, points: row.points + bonus, livePreviewPoints: bonus };
  });

  const sorted = [...withPreview].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    return a.player.firstName.localeCompare(b.player.firstName, "fr");
  });

  let position = 0;
  let previousPoints: number | null = null;
  const rows = sorted.map((row, index) => {
    if (previousPoints === null || previousPoints !== row.points) position = index + 1;
    previousPoints = row.points;
    return { ...row, position };
  });

  return { ...table, rows, hasLivePreview: true };
}
