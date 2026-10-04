/**
 * Quand une journée entière est-elle verrouillée ?
 *
 * Une journée peut étaler ses coups d'envoi sur tout un week-end (samedi
 * 14h30, 16h35, 21h05, dimanche 19h05...). Révéler un pouvoir dès le coup
 * d'envoi de SON PROPRE match — ou, pour un pouvoir sans match (le Duel),
 * dès le premier coup d'envoi de la journée — laisse une fenêtre de riposte
 * ouverte sur tout match encore à verrouiller dans la même journée : la
 * cible (ou n'importe qui lisant le Fil) peut encore répliquer avant que son
 * propre geste ne coure le même risque.
 *
 * La bonne mesure n'est donc jamais « le match visé a commencé » ni « le
 * premier match de la journée a commencé », mais « TOUS les matchs de la
 * journée ont verrouillé » — c'est-à-dire l'instant du DERNIER verrouillage
 * (`max(fixtures.locks_at)`) parmi les matchs de cette `round_id`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Le dernier verrouillage de chaque journée demandée, à partir des matchs
 * réellement en base — jamais une approximation (premier coup d'envoi,
 * coup d'envoi du seul match visé).
 *
 * `null` pour une journée sans aucun match connu : rien ne justifie de la
 * cacher indéfiniment, comme `isPowerPublic` le fait déjà pour un pouvoir
 * sans date du tout.
 */
export async function loadRoundRevealTimes(
  sb: SupabaseClient,
  roundIds: readonly string[],
): Promise<Map<string, string | null>> {
  const ids = [...new Set(roundIds)];
  const result = new Map<string, string | null>();
  if (ids.length === 0) return result;

  const { data, error } = await sb
    .from("fixtures")
    .select("round_id, locks_at")
    .in("round_id", ids);
  if (error) throw error;

  for (const f of (data ?? []) as Array<{ round_id: string; locks_at: string }>) {
    const current = result.get(f.round_id);
    if (!current || f.locks_at > current) result.set(f.round_id, f.locks_at);
  }
  // Une journée demandée mais sans aucun match trouvé reste absente de la
  // map plutôt que d'y entrer à `null` par erreur — l'appelant doit alors
  // faire `?? null` comme pour n'importe quelle clé manquante.
  return result;
}

/** Même chose pour une seule journée — confort d'appel. */
export async function loadRoundRevealTime(
  sb: SupabaseClient,
  roundId: string,
): Promise<string | null> {
  const map = await loadRoundRevealTimes(sb, [roundId]);
  return map.get(roundId) ?? null;
}
