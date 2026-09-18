/**
 * La bascule d'une réaction, côté affichage.
 *
 * Pure et isolée pour deux raisons : elle se teste sans React, et l'écran
 * applique exactement la règle que le serveur appliquera — sinon la pastille
 * optimiste raconterait autre chose que la base.
 */

export interface Reaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export function applyToggle(reactions: Reaction[], emoji: string): Reaction[] {
  return reactions.map((r) =>
    r.emoji === emoji
      ? { ...r, mine: !r.mine, count: Math.max(0, r.count + (r.mine ? -1 : 1)) }
      : r,
  );
}
