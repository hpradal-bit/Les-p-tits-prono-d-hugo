/**
 * Fournisseur de secours : API-Sports (`api-rugby`).
 *
 * Contrat documenté et stable, mais **100 requêtes par jour** en offre gratuite,
 * remises à zéro à 00:00 UTC. Chaque appel est donc compté et remonté dans
 * `sync_runs.requests_used` : c'est ce compteur qui protège le quota.
 *
 * On ne l'appelle qu'en cas d'échec d'ESPN. En régime normal, la consommation
 * doit rester à zéro.
 */

import {
  asNumber,
  asRecord,
  asString,
  createJsonFetcher,
  dig,
  type JsonFetcher,
} from "./http.ts";
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

export const APISPORTS = "apisports";

const DEFAULT_BASE_URL = "https://v1.rugby.api-sports.io";
/** Quota de l'offre gratuite. Peut être ajusté depuis `app_settings`. */
export const APISPORTS_FREE_QUOTA = 100;

export interface ApiSportsOptions {
  apiKey: string;
  fetchJson?: JsonFetcher;
  baseUrl?: string;
  dailyQuota?: number;
}

// --- Analyse des réponses (pure, testée sur échantillons) --------------------

/**
 * API-Sports décrit l'état par un code court : `NS` (pas commencé), `1H`, `HT`,
 * `2H`, `FT` (terminé), `PST` (reporté), `CANC`, `ABD`.
 */
export function mapApiSportsStatus(short: unknown): FixtureStatus {
  const code = (asString(short) ?? "").toUpperCase();
  if (["NS", "TBD"].includes(code)) return "scheduled";
  if (["1H", "HT", "2H", "ET", "BT", "LIVE"].includes(code)) return "live";
  if (["FT", "AET", "AWD", "WO"].includes(code)) return "finished";
  if (["PST", "SUSP", "INT"].includes(code)) return "postponed";
  if (["CANC", "ABD"].includes(code)) return "cancelled";
  return "scheduled";
}

function parseTeam(raw: unknown): ProviderTeam | null {
  const team = asRecord(raw);
  const name = asString(team?.name);
  if (!name) return null;
  return {
    externalId: asString(team?.id),
    name,
    aliases: [asString(team?.code)].filter((v): v is string => v !== null),
  };
}

/** Les erreurs d'API-Sports arrivent en HTTP 200, dans un champ `errors`. */
function assertNoDeclaredError(root: Record<string, unknown>): void {
  const errors = root.errors;
  const list = Array.isArray(errors)
    ? errors.map((e) => asString(e))
    : Object.values(asRecord(errors) ?? {}).map((e) => asString(e));
  const declared = list.filter((e): e is string => e !== null);
  if (declared.length > 0) {
    throw new ProviderError(APISPORTS, `erreur déclarée par l'API : ${declared.join(" · ")}`);
  }
}

/** Le tableau `response` d'un appel `/games` → nos matchs. */
export function parseApiSportsGames(payload: unknown): {
  fixtures: ProviderFixture[];
  warnings: string[];
} {
  const root = asRecord(payload);
  if (!root) throw new ProviderError(APISPORTS, "réponse vide ou non exploitable");
  assertNoDeclaredError(root);

  if (!Array.isArray(root.response)) {
    throw new ProviderError(APISPORTS, "champ `response` absent : format inattendu");
  }

  const warnings: string[] = [];
  const fixtures: ProviderFixture[] = [];

  for (const raw of root.response) {
    const game = asRecord(raw);
    if (!game) continue;

    const externalId = asString(game.id);
    const timestamp = asNumber(game.timestamp);
    const dateRaw = asString(game.date);
    const kickoff =
      timestamp !== null ? new Date(timestamp * 1000) : dateRaw ? new Date(dateRaw) : null;

    if (!externalId || !kickoff || Number.isNaN(kickoff.getTime())) {
      warnings.push("match ignoré : identifiant ou date manquants");
      continue;
    }

    const home = parseTeam(dig(game, "teams", "home"));
    const away = parseTeam(dig(game, "teams", "away"));
    if (!home || !away) {
      warnings.push(`match ${externalId} ignoré : équipes illisibles`);
      continue;
    }

    const status = mapApiSportsStatus(dig(game, "status", "short"));
    const homeScore = asNumber(dig(game, "scores", "home"));
    const awayScore = asNumber(dig(game, "scores", "away"));
    const scoresKnown = status !== "scheduled" && homeScore !== null && awayScore !== null;

    fixtures.push({
      externalId,
      kickoffAt: kickoff.toISOString(),
      // Un horaire venant d'un horodatage est toujours précis.
      kickoffPrecise: timestamp !== null || /\d{2}:\d{2}/.test(dateRaw ?? ""),
      status,
      homeTeam: home,
      awayTeam: away,
      homeScore: scoresKnown ? homeScore : null,
      awayScore: scoresKnown ? awayScore : null,
      minute: status === "live" ? asNumber(dig(game, "status", "timer")) : null,
      venue: asString(game.venue) ?? asString(dig(game, "venue", "name")),
      roundLabel: asString(dig(game, "league", "round")) ?? asString(game.week),
    });
  }

  return { fixtures, warnings };
}

/** Le tableau `response` d'un appel `/standings` → nos lignes de classement. */
export function parseApiSportsStandings(payload: unknown): {
  rows: ProviderStandingRow[];
  warnings: string[];
} {
  const root = asRecord(payload);
  if (!root) throw new ProviderError(APISPORTS, "classement vide ou non exploitable");
  assertNoDeclaredError(root);
  if (!Array.isArray(root.response)) {
    throw new ProviderError(APISPORTS, "classement illisible : `response` absent");
  }

  // La réponse est un tableau de groupes (poules), chacun tableau de lignes.
  const entries: unknown[] = [];
  for (const group of root.response) {
    if (Array.isArray(group)) entries.push(...group);
    else entries.push(group);
  }

  const warnings: string[] = [];
  const rows: ProviderStandingRow[] = [];

  entries.forEach((raw, index) => {
    const entry = asRecord(raw);
    const team = parseTeam(dig(entry, "team"));
    if (!entry || !team) {
      warnings.push("ligne de classement ignorée : équipe illisible");
      return;
    }

    rows.push({
      team,
      position: asNumber(entry.position) ?? index + 1,
      played: asNumber(dig(entry, "games", "played")) ?? 0,
      won:
        asNumber(dig(entry, "games", "win", "total")) ??
        asNumber(dig(entry, "games", "win")) ??
        0,
      drawn:
        asNumber(dig(entry, "games", "drawn", "total")) ??
        asNumber(dig(entry, "games", "drawn")) ??
        0,
      lost:
        asNumber(dig(entry, "games", "lost", "total")) ??
        asNumber(dig(entry, "games", "lost")) ??
        0,
      pointsFor: asNumber(dig(entry, "points", "for")) ?? 0,
      pointsAgainst: asNumber(dig(entry, "points", "against")) ?? 0,
      bonusOffensive: asNumber(dig(entry, "points", "bonus", "offensive")) ?? 0,
      bonusDefensive: asNumber(dig(entry, "points", "bonus", "defensive")) ?? 0,
      points: asNumber(entry.points_total) ?? asNumber(dig(entry, "points", "total")) ?? 0,
    });
  });

  return { rows: rows.sort((a, b) => a.position - b.position), warnings };
}

// --- Le fournisseur ----------------------------------------------------------

/**
 * `seasonExternalId` a la forme `ligue:saison`, par exemple `16:2026`, et vient
 * de `external_refs` : aucun identifiant de ligue n'est écrit dans le code.
 */
export function splitSeasonRef(seasonExternalId: string): { league: string; season: string } {
  const [league, season] = (seasonExternalId ?? "").split(":");
  if (!league || !season) {
    throw new ProviderError(
      APISPORTS,
      `référence de saison invalide : « ${seasonExternalId} » (attendu « ligue:saison »)`,
    );
  }
  return { league, season };
}

export function createApiSportsProvider(options: ApiSportsOptions): SportsDataProvider {
  const fetchJson = options.fetchJson ?? createJsonFetcher(APISPORTS);
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const headers = { "x-apisports-key": options.apiKey };

  async function games(query: string): Promise<ProviderResponse<ProviderFixture[]>> {
    const payload = await fetchJson(`${baseUrl}/games?${query}`, { headers });
    const { fixtures, warnings } = parseApiSportsGames(payload);
    return { provider: APISPORTS, data: fixtures, requestsUsed: 1, warnings };
  }

  return {
    name: APISPORTS,
    dailyQuota: options.dailyQuota ?? APISPORTS_FREE_QUOTA,

    /**
     * Un seul appel pour toute la saison : interroger date par date brûlerait
     * le quota en une matinée. La plage ne sert qu'à filtrer le résultat.
     */
    async getFixtures(seasonExternalId: string, range: DateRange) {
      const { league, season } = splitSeasonRef(seasonExternalId);
      const result = await games(
        `league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`,
      );
      const from = `${range.from}T00:00:00.000Z`;
      const to = `${range.to}T23:59:59.999Z`;
      return {
        ...result,
        data: result.data.filter((f) => f.kickoffAt >= from && f.kickoffAt <= to),
      };
    },

    async getLiveScores(seasonExternalId: string, date: string) {
      const { league, season } = splitSeasonRef(seasonExternalId);
      return games(
        `league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}` +
          `&date=${encodeURIComponent(date)}`,
      );
    },

    async getStandings(seasonExternalId: string) {
      const { league, season } = splitSeasonRef(seasonExternalId);
      const payload = await fetchJson(
        `${baseUrl}/standings?league=${encodeURIComponent(league)}` +
          `&season=${encodeURIComponent(season)}`,
        { headers },
      );
      const { rows, warnings } = parseApiSportsStandings(payload);
      return { provider: APISPORTS, data: rows, requestsUsed: 1, warnings };
    },
  };
}
