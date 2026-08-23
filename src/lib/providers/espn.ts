/**
 * Fournisseur principal : l'API interne d'ESPN.
 *
 * Gratuite, sans clé, sans quota — mais non documentée : elle peut changer de
 * forme du jour au lendemain. Tout est donc lu défensivement, champ par champ,
 * et la moindre incohérence fait basculer sur le fournisseur de secours plutôt
 * que d'écrire n'importe quoi en base.
 *
 * L'identifiant de ligue (270559 pour le Top 14) n'est pas écrit ici : il est
 * lu dans `external_refs` et passé en paramètre.
 */

import {
  asArray,
  asNumber,
  asRecord,
  asString,
  createJsonFetcher,
  dig,
  type JsonFetcher,
} from "./http.ts";
import { compactDate } from "./schedule.ts";
import {
  ProviderError,
  type DateRange,
  type ProviderFixture,
  type ProviderResponse,
  type ProviderStandingRow,
  type ProviderTeam,
  type SportsDataProvider,
} from "./types.ts";
import type { FixtureStatus } from "@/lib/types";

export const ESPN = "espn";

const DEFAULT_BASE_URL = "https://site.api.espn.com/apis/site/v2/sports/rugby";
const DEFAULT_CORE_URL = "https://site.api.espn.com/apis/v2/sports/rugby";

export interface EspnOptions {
  fetchJson?: JsonFetcher;
  baseUrl?: string;
  /** Racine des classements, différente de celle du tableau de scores. */
  standingsUrl?: string;
}

// --- Analyse des réponses (pure, testée sur échantillons) --------------------

/**
 * ESPN décrit l'état d'un match par `status.type.state` (`pre`, `in`, `post`)
 * et un drapeau `completed`. On le traduit dans notre vocabulaire.
 *
 * Un match `post` est `finished`, jamais `official` : c'est la synchronisation
 * qui décidera, après un délai configuré, qu'un résultat devient définitif.
 */
export function mapEspnStatus(state: unknown, detail: unknown, completed: unknown): FixtureStatus {
  const name = (asString(detail) ?? "").toUpperCase();
  if (name.includes("POSTPONED") || name.includes("DELAYED")) return "postponed";
  if (name.includes("CANCEL") || name.includes("ABANDON")) return "cancelled";

  switch (asString(state)) {
    case "pre":
      return "scheduled";
    case "in":
      return "live";
    case "post":
      return completed === false ? "postponed" : "finished";
    default:
      return "scheduled";
  }
}

function parseTeam(competitor: unknown): ProviderTeam | null {
  const team = asRecord(dig(competitor, "team"));
  if (!team) return null;
  const name =
    asString(team.displayName) ??
    asString(team.name) ??
    asString(team.shortDisplayName) ??
    asString(team.location);
  if (!name) return null;

  const aliases = [
    asString(team.name),
    asString(team.shortDisplayName),
    asString(team.location),
    asString(team.abbreviation),
    asString(team.nickname),
  ].filter((v): v is string => v !== null);

  return { externalId: asString(team.id), name, aliases };
}

/**
 * Un coup d'envoi à minuit pile UTC est la marque d'une date sans horaire :
 * on ne confirme pas un horaire pareil, il resterait provisoire.
 */
export function isPreciseKickoff(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return !(d.getUTCHours() === 0 && d.getUTCMinutes() === 0);
}

/** Le tableau de scores ESPN → nos matchs. */
export function parseEspnScoreboard(payload: unknown): {
  fixtures: ProviderFixture[];
  warnings: string[];
} {
  const root = asRecord(payload);
  if (!root) throw new ProviderError(ESPN, "réponse vide ou non exploitable");

  const events = asArray(root.events);
  if (events.length === 0 && !("events" in root)) {
    throw new ProviderError(ESPN, "champ `events` absent : format inattendu");
  }

  const warnings: string[] = [];
  const fixtures: ProviderFixture[] = [];

  for (const event of events) {
    const eventRecord = asRecord(event);
    if (!eventRecord) continue;

    const competition = asRecord(asArray(eventRecord.competitions)[0]) ?? eventRecord;
    const externalId =
      asString(eventRecord.id) ?? asString(competition.id) ?? asString(eventRecord.uid);
    const kickoffRaw = asString(competition.date) ?? asString(eventRecord.date);

    if (!externalId || !kickoffRaw) {
      warnings.push("match ignoré : identifiant ou date manquants");
      continue;
    }
    const kickoff = new Date(kickoffRaw);
    if (Number.isNaN(kickoff.getTime())) {
      warnings.push(`match ${externalId} ignoré : date illisible (${kickoffRaw})`);
      continue;
    }

    const competitors = asArray(competition.competitors);
    const homeRaw = competitors.find((c) => asString(dig(c, "homeAway")) === "home");
    const awayRaw = competitors.find((c) => asString(dig(c, "homeAway")) === "away");
    const home = parseTeam(homeRaw ?? competitors[0]);
    const away = parseTeam(awayRaw ?? competitors[1]);

    if (!home || !away) {
      warnings.push(`match ${externalId} ignoré : équipes illisibles`);
      continue;
    }

    const status = mapEspnStatus(
      dig(competition, "status", "type", "state") ?? dig(eventRecord, "status", "type", "state"),
      dig(competition, "status", "type", "name") ?? dig(eventRecord, "status", "type", "name"),
      dig(competition, "status", "type", "completed") ??
        dig(eventRecord, "status", "type", "completed"),
    );

    const homeScore = asNumber(asRecord(homeRaw ?? competitors[0])?.score);
    const awayScore = asNumber(asRecord(awayRaw ?? competitors[1])?.score);
    const scoresKnown = status !== "scheduled" && homeScore !== null && awayScore !== null;

    const minuteRaw =
      asNumber(dig(competition, "status", "clock") ?? dig(eventRecord, "status", "clock")) ?? null;

    fixtures.push({
      externalId,
      kickoffAt: kickoff.toISOString(),
      kickoffPrecise: isPreciseKickoff(kickoff.toISOString()),
      status,
      homeTeam: home,
      awayTeam: away,
      homeScore: scoresKnown ? homeScore : null,
      awayScore: scoresKnown ? awayScore : null,
      // ESPN compte les secondes écoulées : on veut des minutes de jeu.
      minute: status === "live" && minuteRaw !== null ? Math.round(minuteRaw / 60) : null,
      venue: asString(dig(competition, "venue", "fullName")),
      // ESPN ne donne pas de numéro de journée : au mieux une note éditoriale.
      roundLabel: asString(dig(asArray(competition.notes)[0], "headline")),
    });
  }

  return { fixtures, warnings };
}

/** Retrouve une statistique de classement par son nom ESPN. */
function stat(entry: unknown, ...names: string[]): number | null {
  for (const raw of asArray(dig(entry, "stats"))) {
    const record = asRecord(raw);
    if (!record) continue;
    const name = asString(record.name) ?? asString(record.abbreviation) ?? "";
    if (names.some((n) => n.toLowerCase() === name.toLowerCase())) {
      return asNumber(record.value) ?? asNumber(record.displayValue);
    }
  }
  return null;
}

/** Le classement ESPN → nos lignes de classement. */
export function parseEspnStandings(payload: unknown): {
  rows: ProviderStandingRow[];
  warnings: string[];
} {
  const root = asRecord(payload);
  if (!root) throw new ProviderError(ESPN, "classement vide ou non exploitable");

  // Selon les compétitions : `standings.entries` ou `children[].standings.entries`.
  const groups: unknown[] = [];
  const direct = dig(root, "standings", "entries");
  if (Array.isArray(direct)) groups.push(...direct);
  for (const child of asArray(root.children)) {
    const entries = dig(child, "standings", "entries");
    if (Array.isArray(entries)) groups.push(...entries);
  }

  if (groups.length === 0) throw new ProviderError(ESPN, "aucune entrée de classement trouvée");

  const warnings: string[] = [];
  const rows: ProviderStandingRow[] = [];

  groups.forEach((entry, index) => {
    const team = asRecord(dig(entry, "team"));
    const name =
      asString(team?.displayName) ?? asString(team?.name) ?? asString(team?.shortDisplayName);
    if (!name) {
      warnings.push("ligne de classement ignorée : équipe illisible");
      return;
    }

    rows.push({
      team: {
        externalId: asString(team?.id),
        name,
        aliases: [
          asString(team?.name),
          asString(team?.shortDisplayName),
          asString(team?.location),
          asString(team?.abbreviation),
        ].filter((v): v is string => v !== null),
      },
      position: stat(entry, "rank", "position") ?? index + 1,
      played: stat(entry, "gamesPlayed", "GP") ?? 0,
      won: stat(entry, "wins", "W") ?? 0,
      drawn: stat(entry, "ties", "draws", "D") ?? 0,
      lost: stat(entry, "losses", "L") ?? 0,
      pointsFor: stat(entry, "pointsFor", "PF") ?? 0,
      pointsAgainst: stat(entry, "pointsAgainst", "PA") ?? 0,
      bonusOffensive: stat(entry, "bonusPointsTry", "tryBonus") ?? 0,
      bonusDefensive: stat(entry, "bonusPointsLosing", "losingBonus") ?? 0,
      points: stat(entry, "points", "PTS") ?? 0,
    });
  });

  return { rows: rows.sort((a, b) => a.position - b.position), warnings };
}

// --- Le fournisseur ----------------------------------------------------------

export function createEspnProvider(options: EspnOptions = {}): SportsDataProvider {
  const fetchJson = options.fetchJson ?? createJsonFetcher(ESPN);
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const standingsUrl = (options.standingsUrl ?? DEFAULT_CORE_URL).replace(/\/$/, "");

  async function scoreboard(
    leagueId: string,
    dates: string,
  ): Promise<ProviderResponse<ProviderFixture[]>> {
    const url = `${baseUrl}/${encodeURIComponent(leagueId)}/scoreboard?dates=${dates}&limit=200`;
    const payload = await fetchJson(url);
    const { fixtures, warnings } = parseEspnScoreboard(payload);
    return { provider: ESPN, data: fixtures, requestsUsed: 1, warnings };
  }

  return {
    name: ESPN,
    dailyQuota: null, // aucun quota publié — ce qui ne vaut pas garantie

    async getFixtures(seasonExternalId: string, range: DateRange) {
      return scoreboard(
        seasonExternalId,
        `${compactDate(range.from)}-${compactDate(range.to)}`,
      );
    },

    async getLiveScores(seasonExternalId: string, date: string) {
      return scoreboard(seasonExternalId, compactDate(date));
    },

    async getStandings(seasonExternalId: string) {
      const url = `${standingsUrl}/${encodeURIComponent(seasonExternalId)}/standings`;
      const payload = await fetchJson(url);
      const { rows, warnings } = parseEspnStandings(payload);
      return { provider: ESPN, data: rows, requestsUsed: 1, warnings };
    },
  };
}
