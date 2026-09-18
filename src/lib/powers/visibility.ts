/**
 * Quand un pouvoir déclaré devient-il public ?
 *
 * Jamais avant le coup d'envoi du match visé. Savoir que quelqu'un a posé un
 * Sabotage sur Toulouse - Bayonne avant que les pronostics soient joués, c'est
 * une information qui change la façon de parier : le fil du Vestiaire
 * deviendrait un canal de renseignement plutôt qu'un lieu de chambrage.
 *
 * Le pouvoir qui ne vise aucun match — le Duel vise un joueur — suit la même
 * logique avec le premier coup d'envoi de sa journée : tant que la journée n'a
 * pas commencé, il reste secret. C'est l'appelant qui résout cette heure et la
 * passe ici ; cette fonction ne connaît qu'une date.
 *
 * Le secret est levé par le temps, pas par un statut : un match « en cours »
 * qu'un fournisseur n'aurait pas encore signalé ne doit pas retarder la
 * révélation.
 */

/** Le coup d'envoi est passé : le pouvoir peut être raconté. */
export function isPowerPublic(kickoffAt: string | null | undefined, now: Date = new Date()): boolean {
  // Sans match connu, rien ne justifie de le cacher indéfiniment : un pouvoir
  // dont on ne sait plus à quoi il se rattache reste visible, comme avant.
  if (!kickoffAt) return true;
  const kickoff = new Date(kickoffAt);
  if (Number.isNaN(kickoff.getTime())) return true;
  return kickoff.getTime() <= now.getTime();
}

/**
 * Filtre une liste d'éléments porteurs d'un match, en ne gardant que ceux dont
 * le coup d'envoi est passé.
 */
export function keepPublicPowers<T>(
  items: readonly T[],
  kickoffOf: (item: T) => string | null | undefined,
  now: Date = new Date(),
): T[] {
  return items.filter((item) => isPowerPublic(kickoffOf(item), now));
}
