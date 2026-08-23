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
