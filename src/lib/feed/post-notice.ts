/**
 * La mise en forme d'une notification de message, sans rien qui touche au
 * réseau ni à la base — pour qu'elle reste testable telle quelle.
 */

/** Le type déclaré au catalogue (`notifications.types`). */
export const FEED_POST_KIND = "feed_post";

/** Au-delà, la notification serait tronquée par le système de toute façon. */
export const EXCERPT_MAX = 120;

/**
 * L'extrait affiché sous le titre.
 *
 * Coupé sur un espace quand c'est possible : « l'express a envoyé un… » se lit
 * mieux que « l'express a envo… ». Les retours à la ligne deviennent des
 * espaces, une notification n'ayant qu'une seule ligne utile.
 */
export function excerpt(body: string, max = EXCERPT_MAX): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const kept = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${kept.trimEnd()}…`;
}

/** « 💬 Castrolympix a écrit » — le titre, avec le surnom de l'auteur. */
export function postTitle(authorName: string): string {
  return `💬 ${authorName} a écrit`;
}
