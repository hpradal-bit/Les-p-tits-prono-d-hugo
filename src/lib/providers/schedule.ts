/**
 * Calculs de calendrier : verrouillage, fenêtres de match, regroupement des
 * matchs en journées.
 *
 * Aucune valeur n'est décidée ici : les durées viennent de `app_settings` et du
 * barème (`lock.minutes_before_kickoff`). Ce module ne fait que de l'arithmétique
 * de dates, ce qui le rend testable sans base ni réseau.
 */

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** Le fuseau du championnat : les journées se raisonnent en heure locale. */
export const COMPETITION_TIMEZONE = "Europe/Paris";

/**
 * `locks_at` = coup d'envoi − délai configuré. Recalculé à chaque confirmation
 * d'horaire : c'est le point le plus important de la synchronisation du
 * calendrier, un verrouillage faux laisserait pronostiquer un match commencé.
 */
export function computeLocksAt(kickoffAt: string | Date, minutesBeforeKickoff: number): string {
  const kickoff = new Date(kickoffAt);
  if (Number.isNaN(kickoff.getTime())) {
    throw new Error(`Coup d'envoi illisible : ${String(kickoffAt)}`);
  }
  const minutes = Number.isFinite(minutesBeforeKickoff) ? Math.max(0, minutesBeforeKickoff) : 0;
  return new Date(kickoff.getTime() - minutes * MINUTE_MS).toISOString();
}

/** La date locale (`YYYY-MM-DD`) d'un instant, dans le fuseau du championnat. */
export function localDateKey(instant: string | Date, timeZone = COMPETITION_TIMEZONE): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) throw new Error(`Date illisible : ${String(instant)}`);
  // en-CA donne directement YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** `YYYY-MM-DD` → `YYYYMMDD` (format de plage attendu par ESPN). */
export function compactDate(dateKey: string): string {
  return dateKey.replace(/-/g, "");
}

/**
 * Le samedi de rattachement d'un match : deux rencontres du même week-end
 * appartiennent à la même journée. La semaine est ancrée au jeudi, parce
 * qu'une journée de Top 14 s'étale du jeudi au dimanche.
 */
export function weekendAnchor(instant: string | Date, timeZone = COMPETITION_TIMEZONE): string {
  const key = localDateKey(instant, timeZone);
  const [y, m, d] = key.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const dow = new Date(utc).getUTCDay(); // 0 = dimanche … 6 = samedi

  let shiftDays: number;
  if (dow === 0) shiftDays = -1; // dimanche → samedi de la veille
  else if (dow >= 4) shiftDays = 6 - dow; // jeudi, vendredi, samedi → samedi du week-end
  else shiftDays = -(dow + 1); // lundi à mercredi → samedi précédent

  return new Date(utc + shiftDays * DAY_MS).toISOString().slice(0, 10);
}

/** Regroupe des instants en week-ends, dans l'ordre chronologique. */
export function groupByWeekend<T>(
  items: T[],
  kickoffOf: (item: T) => string,
  timeZone = COMPETITION_TIMEZONE,
): { anchor: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const anchor = weekendAnchor(kickoffOf(item), timeZone);
    const bucket = groups.get(anchor);
    if (bucket) bucket.push(item);
    else groups.set(anchor, [item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([anchor, grouped]) => ({ anchor, items: grouped }));
}

export interface WindowFixture {
  kickoffAt: string;
  /** Un match terminé ou officiel ne rouvre pas de fenêtre. */
  status: string;
}

export interface WindowSettings {
  /** Cadence pendant un match (`sync.live_interval_minutes`). */
  liveIntervalMinutes: number;
  /** Cadence en dehors de tout match (`sync.idle_interval_minutes`). */
  idleIntervalMinutes: number;
  /** Durée d'une fenêtre de match à partir du coup d'envoi (`sync.match_window_minutes`). */
  matchWindowMinutes: number;
  /** On commence à interroger un peu avant le coup d'envoi. */
  preKickoffMinutes?: number;
}

export interface WindowVerdict {
  /** Un match est-il en cours (ou sur le point de commencer) ? */
  inWindow: boolean;
  /** À partir de quand le planificateur doit rappeler `/api/sync/live`. */
  nextCheckAt: string;
  /** Les matchs concernés par la fenêtre en cours, pour le journal. */
  activeKickoffs: string[];
}

/**
 * Y a-t-il un match dans la fenêtre, et quand faut-il revenir ?
 *
 * C'est ce verdict que le Worker met en cache : il évite d'appeler l'API toutes
 * les 5 minutes un mardi de novembre.
 */
export function evaluateWindow(
  now: Date,
  fixtures: WindowFixture[],
  settings: WindowSettings,
): WindowVerdict {
  const pre = (settings.preKickoffMinutes ?? 5) * MINUTE_MS;
  const windowMs = Math.max(1, settings.matchWindowMinutes) * MINUTE_MS;
  const live = Math.max(1, settings.liveIntervalMinutes) * MINUTE_MS;
  const idle = Math.max(1, settings.idleIntervalMinutes) * MINUTE_MS;
  const t = now.getTime();

  const active: string[] = [];
  let nextOpening = Number.POSITIVE_INFINITY;

  for (const fixture of fixtures) {
    const kickoff = new Date(fixture.kickoffAt).getTime();
    if (Number.isNaN(kickoff)) continue;
    if (fixture.status === "cancelled") continue;

    const opensAt = kickoff - pre;
    const closesAt = kickoff + windowMs;

    // Un match déjà terminé ne justifie plus d'interrogation, même dans sa fenêtre.
    const settled = fixture.status === "official";
    if (!settled && t >= opensAt && t <= closesAt) active.push(fixture.kickoffAt);
    else if (opensAt > t) nextOpening = Math.min(nextOpening, opensAt);
  }

  if (active.length > 0) {
    return {
      inWindow: true,
      nextCheckAt: new Date(t + live).toISOString(),
      activeKickoffs: active,
    };
  }

  const idleNext = t + idle;
  const nextCheck = Number.isFinite(nextOpening) ? Math.min(idleNext, nextOpening) : idleNext;
  return { inWindow: false, nextCheckAt: new Date(nextCheck).toISOString(), activeKickoffs: [] };
}

/** Plage de dates couvrant une liste de matchs, élargie d'un jour de marge. */
export function rangeAround(dateKey: string, daysBefore: number, daysAfter: number) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  return {
    from: new Date(base - daysBefore * DAY_MS).toISOString().slice(0, 10),
    to: new Date(base + daysAfter * DAY_MS).toISOString().slice(0, 10),
  };
}

/**
 * Espace le prochain passage pour que le quota tienne jusqu'à la fin du jour.
 *
 * Le scénario redouté n'est pas le dépassement en soi, c'est *quand* il
 * survient : si le fournisseur gratuit tombe un samedi après-midi, la chaîne
 * bascule sur celui qui a un quota — et à cadence de match, celui-ci s'épuise
 * vers 17 h. Il ne reste alors plus aucun fournisseur pour la fin de journée,
 * au pire moment possible.
 *
 * Mieux vaut des scores rafraîchis toutes les vingt minutes jusqu'au coup de
 * sifflet final que toutes les dix minutes jusqu'à 17 h, puis plus rien.
 *
 * Sans quota (`null`), rien n'est ralenti : c'est le cas d'ESPN.
 */
export function paceToQuota(
  intervalMinutes: number,
  quotaRemaining: number | null,
  minutesLeft: number,
): number {
  if (quotaRemaining === null) return intervalMinutes;

  // Plus rien à dépenser : on attend le renouvellement plutôt que de collecter
  // des refus. Jamais moins que l'intervalle demandé — on ne rattrape rien en
  // accélérant ici.
  if (quotaRemaining <= 0) return Math.max(intervalMinutes, minutesLeft);

  return Math.max(intervalMinutes, Math.ceil(minutesLeft / quotaRemaining));
}

/** Minutes restant avant la remise à zéro du quota, à minuit UTC. */
export function minutesLeftInDay(now: Date): number {
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0,
  );
  return Math.max(1, Math.ceil((midnight - now.getTime()) / MINUTE_MS));
}
