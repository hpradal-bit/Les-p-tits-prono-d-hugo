/**
 * Une couleur par joueur, la même partout.
 *
 * Deux graphiques côte à côte n'ont pas le même ordre de lignes : l'un range
 * par place, l'autre par total de points. Prendre la couleur à l'index de la
 * liste affichée donnait donc deux couleurs différentes au même joueur — et
 * surligner un prénom paraissait en allumer deux.
 *
 * La couleur est ici attribuée sur un ordre stable (l'identifiant du joueur),
 * indépendant de l'affichage : Hugo garde la sienne d'un graphique à l'autre,
 * d'une journée à la suivante.
 */

/** Assez de teintes distinctes pour que deux joueurs n'en partagent jamais. */
export const PLAYER_COLORS = [
  "var(--color-clay)",
  "var(--color-sage)",
  "var(--color-winner)",
  "var(--color-perfect)",
  "#6366f1",
  "#ec4899",
  "#0ea5e9",
  "#f59e0b",
  "#14b8a6",
  "#a855f7",
] as const;

export function assignPlayerColors(userIds: readonly string[]): Map<string, string> {
  // Le tri fige l'attribution : elle ne dépend plus de l'ordre d'affichage.
  const ordered = [...new Set(userIds)].sort();
  return new Map(ordered.map((id, i) => [id, PLAYER_COLORS[i % PLAYER_COLORS.length]]));
}

/** La couleur d'un joueur, avec un repli si la carte ne le connaît pas. */
export function playerColor(colors: Map<string, string>, userId: string): string {
  return colors.get(userId) ?? PLAYER_COLORS[0];
}
