/**
 * Les trois règles anti-agacement, en fonctions pures.
 *
 * Une notification de trop et le joueur coupe tout — et il ne réactivera
 * jamais. Ces règles ne sont donc pas du confort : elles décident si les
 * notifications survivent à la troisième journée.
 *
 *   1. regroupement    → une clé de dédoublonnage, pas sept messages
 *   2. heures de silence → on reporte au matin, on ne supprime pas
 *   3. plafond quotidien → au-delà, on laisse tomber
 */

/** « 22:00 » → 1320 minutes depuis minuit. */
export function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Les minutes écoulées depuis minuit, dans le fuseau du jeu. */
export function minutesOfDay(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone,
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (h % 24) * 60 + m;
}

/**
 * Sommes-nous dans les heures de silence ?
 * La plage traverse minuit (22 h → 8 h) : c'est le cas courant, pas l'exception.
 */
export function isQuiet(minute: number, from: number, to: number): boolean {
  if (from === to) return false;
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

export interface QuietHours {
  from: string;
  to: string;
  timeZone: string;
}

/**
 * L'instant d'envoi retenu : maintenant, ou la fin des heures de silence.
 *
 * Une notification tombant à 23 h 40 est **reportée à 8 h**, pas supprimée :
 * le joueur doit la trouver au réveil, pas la perdre.
 */
export function scheduleFor(wanted: Date, quiet: QuietHours): Date {
  const from = toMinutes(quiet.from);
  const to = toMinutes(quiet.to);
  if (from === null || to === null) return wanted;

  const minute = minutesOfDay(wanted, quiet.timeZone);
  if (!isQuiet(minute, from, to)) return wanted;

  // Combien de minutes jusqu'à la sortie du silence.
  const delta = to > minute ? to - minute : 24 * 60 - minute + to;
  return new Date(wanted.getTime() + delta * 60_000);
}

/**
 * L'instant d'envoi qui respecte **toutes** les plages de silence à la fois.
 *
 * Les heures du groupe sont un plancher, pas un défaut : un joueur peut se
 * faire plus silencieux, jamais plus bruyant. On reporte donc tant qu'une
 * seule des plages est en silence, au lieu de laisser la plage du joueur
 * remplacer celle du groupe.
 */
export function scheduleForAll(wanted: Date, quiets: QuietHours[]): Date {
  const windows = quiets.filter(
    (q) => toMinutes(q.from) !== null && toMinutes(q.to) !== null,
  );
  if (windows.length === 0) return wanted;

  let at = wanted;
  // Sortir d'une plage peut faire entrer dans une autre : on repasse jusqu'à
  // ce que plus rien ne bouge. La borne évite la boucle infinie quand l'union
  // des plages couvre la journée entière.
  for (let pass = 0; pass < windows.length * 2; pass++) {
    const next = windows.reduce((acc, w) => scheduleFor(acc, w), at);
    if (next.getTime() === at.getTime()) return at;
    at = next;
  }

  // Union couvrant les 24 heures : aucun instant n'est libre. On s'en tient
  // alors à la plage du groupe — c'est elle, la garantie ; le joueur a demandé
  // un silence permanent, ce que le vrai bouton « tout couper » sait faire.
  return scheduleFor(wanted, windows[0]);
}

/** La clé de regroupement : sept matchs d'une journée, un seul message. */
export function dedupeKey(kind: string, scopeId: string, day?: string): string {
  return day ? `${kind}:${scopeId}:${day}` : `${kind}:${scopeId}`;
}

/** Le jour civil dans le fuseau du jeu, « 2026-09-05 ». */
export function dayKey(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone,
  }).format(at);
}
