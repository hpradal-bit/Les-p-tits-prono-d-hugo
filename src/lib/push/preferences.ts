/**
 * Préférences de notification par joueur : la fusion catalogue × choix.
 *
 * Le catalogue des types vit dans `app_settings` (`notifications.types`), les
 * choix du joueur dans `notification_preferences`. Ni l'un ni l'autre ne suffit
 * seul : un type sans ligne de préférence n'est pas « éteint », il est « pas
 * encore choisi » — et c'est alors `default_enabled` du catalogue qui tranche.
 * Cette règle est la même à l'écran et à l'envoi ; c'est pour ça qu'elle vit
 * ici, dans une fonction pure, plutôt que dupliquée des deux côtés.
 *
 * Aucun accès base : entièrement testable.
 */

/** Une entrée du catalogue, telle qu'elle est rangée dans `app_settings`. */
export interface CatalogEntry {
  kind: string;
  emoji: string;
  label: string;
  description: string;
  /** Le type est-il réellement branché à du code qui l'émet ? */
  wired?: boolean;
  /** Ce que reçoit un joueur qui n'a jamais rien réglé. */
  default_enabled?: boolean;
}

/** Une ligne de `notification_preferences`, réduite à ce qui compte ici. */
export interface PreferenceRow {
  kind: string;
  is_enabled: boolean;
}

/** Un type prêt à être affiché, son état effectif déjà tranché. */
export interface EffectivePreference {
  kind: string;
  emoji: string;
  label: string;
  description: string;
  /** Branché : un type « bientôt » se montre, mais ne se règle pas. */
  wired: boolean;
  /** L'état à cocher : choix explicite du joueur, sinon défaut du catalogue. */
  enabled: boolean;
  /** Le joueur a-t-il déjà tranché lui-même, ou est-ce encore le défaut ? */
  isExplicit: boolean;
}

/**
 * Le défaut d'un type. Absent du catalogue, un type est considéré actif :
 * mieux vaut une notification de trop qu'un joueur qui rate la seule qui
 * comptait — et l'admin peut toujours poser `default_enabled: false`.
 */
function defaultOf(entry: CatalogEntry): boolean {
  return entry.default_enabled ?? true;
}

/**
 * Fusionne le catalogue et les choix du joueur.
 *
 * L'ordre du catalogue fait foi — c'est celui de l'espace admin, et le joueur
 * doit retrouver la même liste dans le même ordre. Une préférence orpheline
 * (un type retiré du catalogue depuis) est ignorée plutôt que ressuscitée :
 * le catalogue est la seule source de vérité de ce qui existe.
 */
export function mergePreferences(
  catalog: CatalogEntry[],
  rows: PreferenceRow[],
): EffectivePreference[] {
  const chosen = new Map(rows.map((r) => [r.kind, r.is_enabled]));

  return catalog.map((entry) => {
    const explicit = chosen.get(entry.kind);
    return {
      kind: entry.kind,
      emoji: entry.emoji,
      label: entry.label,
      description: entry.description,
      wired: entry.wired === true,
      enabled: explicit ?? defaultOf(entry),
      isExplicit: explicit !== undefined,
    };
  });
}

/**
 * Ce même arbitrage, côté envoi : ce joueur doit-il recevoir ce type ?
 *
 * `enqueue` s'en sert pour ne pas réécrire la règle de son côté. Un type
 * absent du catalogue ne part pas : s'il n'est pas déclaré, il n'existe pas.
 */
export function isKindEnabledFor(
  catalog: CatalogEntry[],
  rows: PreferenceRow[],
  kind: string,
): boolean {
  const entry = catalog.find((c) => c.kind === kind);
  if (!entry) return false;
  if (entry.wired !== true) return false;

  const explicit = rows.find((r) => r.kind === kind);
  return explicit ? explicit.is_enabled : defaultOf(entry);
}

/** Les types que le joueur peut réellement régler — les autres sont décoratifs. */
export function settableKinds(catalog: CatalogEntry[]): string[] {
  return catalog.filter((c) => c.wired === true).map((c) => c.kind);
}
