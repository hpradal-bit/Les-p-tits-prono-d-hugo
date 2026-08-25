/**
 * Le pont entre le calcul des séries et la table `streaks`.
 *
 * `src/lib/stats/streaks.ts` sait tout calculer depuis les pronostics notés —
 * il ne manquait qu'un endroit qui l'appelle et qui écrive. C'est ici, à la
 * clôture d'une journée, au même moment que les badges et l'instantané du
 * classement.
 *
 * La table est un **cache**, pas une source : elle est reconstruite à chaque
 * clôture à partir de la saison entière. La perdre ne perd rien, la rejouer
 * redonne exactement les mêmes valeurs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { STREAK_DB_KIND, type PlayerStreaks } from "./streaks.ts";
import type { Uuid } from "../types.ts";

/** Une ligne prête pour la table `streaks`. */
export interface StreakRow {
  user_id: Uuid;
  season_id: Uuid;
  kind: string;
  current_value: number;
  best_value: number;
  updated_at: string;
}

/**
 * La partie pure : des séries par joueur aux lignes à écrire.
 *
 * Un joueur sans aucune série (ni en cours, ni de record) ne produit pas de
 * ligne : la table ne se remplit pas de zéros. Mais une série retombée à zéro
 * dont le record subsiste est bien écrite — c'est tout l'intérêt du record.
 */
export function planStreakRows(
  streaks: Iterable<[Uuid, PlayerStreaks]>,
  seasonId: Uuid,
  updatedAt: string,
): StreakRow[] {
  const rows: StreakRow[] = [];

  for (const [userId, player] of streaks) {
    for (const kind of ["good", "bad"] as const) {
      const value = player[kind];
      if (value.current === 0 && value.best === 0) continue;
      rows.push({
        user_id: userId,
        season_id: seasonId,
        kind: STREAK_DB_KIND[kind],
        current_value: value.current,
        best_value: value.best,
        updated_at: updatedAt,
      });
    }
  }

  return rows;
}

/**
 * Écrit les séries de la saison. `upsert` sur la contrainte d'unicité :
 * une ligne par joueur et par nature de série, mise à jour en place.
 */
export async function persistStreaks(
  admin: SupabaseClient,
  streaks: Iterable<[Uuid, PlayerStreaks]>,
  seasonId: Uuid,
): Promise<number> {
  const rows = planStreakRows(streaks, seasonId, new Date().toISOString());
  if (rows.length === 0) return 0;

  const { error } = await admin
    .from("streaks")
    .upsert(rows, { onConflict: "user_id,season_id,kind" });
  if (error) throw error;

  return rows.length;
}
