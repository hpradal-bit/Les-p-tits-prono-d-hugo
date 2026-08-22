/**
 * Verrouillage — fonctions pures.
 *
 * Règle absolue : l'heure du client ne décide de RIEN. Ces fonctions servent à
 * afficher un compte à rebours et à griser un bouton ; l'autorisation d'écrire,
 * elle, est prononcée par le serveur et par la base (`fixtures.locks_at`
 * comparé à `now()` de PostgreSQL, cf. migration 0011).
 */

/** Millisecondes restantes avant un instant donné. Négatif = déjà passé. */
export function msUntil(iso: string, now: number | Date = Date.now()): number {
  const target = Date.parse(iso);
  const from = typeof now === "number" ? now : now.getTime();
  return target - from;
}

/** Indication d'affichage — jamais une autorisation. */
export function isLockedAt(locksAt: string, now: number | Date = Date.now()): boolean {
  return msUntil(locksAt, now) <= 0;
}

/** Le prochain verrouillage à venir parmi une liste, ou null s'ils sont tous passés. */
export function nextLockAt(
  locksAt: readonly string[],
  now: number | Date = Date.now(),
): string | null {
  const upcoming = locksAt
    .filter((iso) => msUntil(iso, now) > 0)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return upcoming[0] ?? null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Compte à rebours lisible d'un coup d'œil, en français.
 * On ne descend au format « minutes:secondes » que dans la dernière heure :
 * c'est là que la précision compte.
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "verrouillé";
  if (ms < MINUTE) return `${Math.ceil(ms / 1000)} s`;

  if (ms < HOUR) {
    const m = Math.floor(ms / MINUTE);
    const s = Math.floor((ms % MINUTE) / 1000);
    return `${m} min ${String(s).padStart(2, "0")}`;
  }

  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    const m = Math.floor((ms % HOUR) / MINUTE);
    return `${h} h ${String(m).padStart(2, "0")}`;
  }

  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  return h > 0 ? `${d} j ${h} h` : `${d} j`;
}

/** « ferme dans 3 h 05 » / « fermé ». */
export function lockSentence(locksAt: string, now: number | Date = Date.now()): string {
  const ms = msUntil(locksAt, now);
  return ms <= 0 ? "fermé" : `ferme dans ${formatCountdown(ms)}`;
}

/** Horaire du coup d'envoi, dans le fuseau du jeu. « sam. 5 sept. · 15:00 ». */
export function formatKickoff(iso: string, timeZone: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).format(d);
  const time = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(d);
  return `${day} · ${time}`;
}

/** « samedi 5 septembre 2026 » — pour l'en-tête de la journée. */
export function formatLongDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(new Date(iso));
}
