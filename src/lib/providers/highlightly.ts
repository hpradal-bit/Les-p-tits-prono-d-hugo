/**
 * Fournisseur de secours n°2 : Highlightly (Rugby Highlights API).
 *
 * 100 requêtes par jour en offre gratuite, sans carte bancaire. Couvre le
 * Top 14, le Pro D2 et une centaine d'autres compétitions. Accessible via
 * RapidAPI ou directement sur highlightly.net — les deux interfaces offrent
 * les mêmes données.
 *
 * Le `seasonExternalId` attendu est au format `{leagueId}:{season}`, par
 * exemple `123:2026` (l'identifiant de ligue Highlightly, puis l'année).
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
import {
  ProviderError,
  type DateRange,
  type ProviderFixture,
  type ProviderStandingRow,
  type ProviderTeam,
  type SportsDataProvider,
} from "./types.ts";
import type { FixtureStatus } from "@/lib/types";

export const HIGHLIGHTLY = "highlightly";
export const HIGHLIGHTLY_FREE_QUOTA = 100;

const DEFAULT_BASE_URL = "https://rugby-highlights-api.p.rapidapi.com";
const DEFAULT_HOST = "rugby-highlights-api.p.rapidapi.com";

export interface HighlightlyOptions {
  apiKey: string;
  fetchJson?: JsonFetcher;
  baseUrl?: string;
  host?: string;
  dailyQuota?: number;
}

// --- Découpage du seasonExternalId -------------------------------------------

function splitSeasonRef(ref: string): { leagueId: string; season: string } {
  const sep = ref.indexOf(":");
  if (sep < 1) {
    throw new ProviderError(HIGHLIGHTLY, `référence de saison invalide : « ${ref} » (attendu leagueId:season)`);
  }
  return { leagueId: ref.slice(0, sep), season: ref.slice(sep + 1) };
}

// --- Analyse des réponses (pure, défensive) ----------------------------------

function mapHighlightlyStatus(raw: unknown): FixtureStatus {
  const s = (asString(raw) ?? "").toLowerCase().trim();
  if (!s || s === "not started" || s === "ns" || s === "scheduled" || s === "tbd") return "scheduled";
  if (s.includes("live") || s === "1h" || s === "2h" || s === "ht" || s === "in progress" || s === "ongoing") return "live";
  if (s.includes("finished") || s === "ft" || s === "ended" || s === "completed" || s === "full time") return "finished";
  if (s.includes("postponed") || s === "pst") return "postponed";
  if (s.includes("cancel") || s.includes("abandon") || s === "canc" || s === "abd") return "cancelled";
  return "scheduled";
}

function parseHighlightlyTeam(raw: unknown): ProviderTeam | null {
  const obj = asRecord(raw);
  if (!obj) {
    const name = asString(raw);
    return name ? { externalId: null, name, aliases: [] } : null;
  }
  const name = asString(obj.name) ?? asString(obj.displayName);
  if (!name) return null;
  const aliases = [asString(obj.shortName), asString(obj.abbreviation)].filter(
    (v): v is string => v !== null,
  );
  return {
    externalId: asString(obj.id),
    name,
    aliases,
  };
}

export function parseHighlightlyMatches(payload: unknown): {
  fixtures: ProviderFixture[];
  warnings: string[];
} {
  // La réponse peut être un tableau direct ou un objet avec une clé « matches »
  // ou « data ».
  let items: unknown[];
  if (Array.isArray(payload)) {
    items = payload;
  } else {
    const root = asRecord(payload);
    if (!root) throw new ProviderError(HIGHLIGHTLY, "réponse vide ou non exploitable");
    items = asArray(root.matches ?? root.data ?? root.response ?? root.results);
    if (items.length === 0 && !("matches" in root || "data" in root || "response" in root || "results" in root)) {
      throw new ProviderError(HIGHLIGHTLY, "aucune clé de données trouvée");
    }
  }

  const warnings: string[] = [];
  const fixtures: ProviderFixture[] = [];

  for (const item of items) {
    const m = asRecord(item);
    if (!m) continue;

    const externalId = asString(m.id) ?? asString(m.matchId);
    if (!externalId) {
      warnings.push("match ignoré : identifiant absent");
      continue;
    }

    const dateRaw = asString(m.date) ?? asString(m.startDate) ?? asString(m.utcDate);
    if (!dateRaw) {
      warnings.push(`match ${externalId} ignoré : date illisible`);
      continue;
    }
    const kickoff = new Date(dateRaw);
    if (Number.isNaN(kickoff.getTime())) {
      warnings.push(`match ${externalId} ignoré : date invalide (${dateRaw})`);
      continue;
    }
    const precise = !(kickoff.getUTCHours() === 0 && kickoff.getUTCMinutes() === 0);

    const home =
      parseHighlightlyTeam(m.homeTeam ?? m.home_team ?? dig(m, "teams", "home"));
    const away =
      parseHighlightlyTeam(m.awayTeam ?? m.away_team ?? dig(m, "teams", "away"));
    if (!home || !away) {
      warnings.push(`match ${externalId} ignoré : équipes illisibles`);
      continue;
    }

    const status = mapHighlightlyStatus(
      m.status ?? m.state ?? dig(m, "fixture", "status", "short"),
    );

    const homeScore =
      asNumber(m.homeScore ?? m.home_score ?? dig(m, "score", "home") ?? dig(m, "goals", "home"));
    const awayScore =
      asNumber(m.awayScore ?? m.away_score ?? dig(m, "score", "away") ?? dig(m, "goals", "away"));
    const scoresKnown = status !== "scheduled" && homeScore !== null && awayScore !== null;

    const minute = status === "live" ? (asNumber(m.minute) ?? asNumber(m.elapsed) ?? null) : null;

    const roundRaw = asString(m.round) ?? asString(dig(m, "league", "round"));

    fixtures.push({
      externalId,
      kickoffAt: kickoff.toISOString(),
      kickoffPrecise: precise,
      status,
      homeTeam: home,
      awayTeam: away,
      homeScore: scoresKnown ? homeScore : null,
      awayScore: scoresKnown ? awayScore : null,
      minute,
      venue: asString(m.venue) ?? asString(dig(m, "venue", "name")),
      roundLabel: roundRaw,
    });
  }

  return { fixtures, warnings };
}

export function parseHighlightlyStandings(payload: unknown): {
  rows: ProviderStandingRow[];
  warnings: string[];
} {
  let items: unknown[];
  if (Array.isArray(payload)) {
    items = payload;
  } else {
    const root = asRecord(payload);
    if (!root) throw new ProviderError(HIGHLIGHTLY, "classement vide ou non exploitable");
    // Le classement peut être enveloppé sous « standings », « data », ou « response ».
    // Il peut aussi être groupé par conférence : on aplatit.
    const raw = root.standings ?? root.data ?? root.response ?? root.results;
    if (Array.isArray(raw)) {
      // Vérifier si c'est un tableau de groupes (chacun avec « table » ou « rows »).
      const first = asRecord(raw[0]);
      if (first && ("table" in first || "rows" in first)) {
        items = raw.flatMap((g) => asArray(dig(g, "table") ?? dig(g, "rows")));
      } else {
        items = raw;
      }
    } else {
      throw new ProviderError(HIGHLIGHTLY, "aucune donnée de classement trouvée");
    }
  }

  if (items.length === 0) throw new ProviderError(HIGHLIGHTLY, "classement vide");

  const warnings: string[] = [];
  const rows: ProviderStandingRow[] = [];

  items.forEach((entry, index) => {
    const e = asRecord(entry);
    if (!e) return;

    const team = parseHighlightlyTeam(e.team ?? e);
    const teamName = team?.name ?? asString(e.name) ?? asString(e.teamName);
    if (!teamName) {
      warnings.push("ligne de classement ignorée : équipe illisible");
      return;
    }

    rows.push({
      team: team ?? { externalId: asString(e.id) ?? asString(e.teamId), name: teamName, aliases: [] },
      position: asNumber(e.position) ?? asNumber(e.rank) ?? index + 1,
      played: asNumber(e.played) ?? asNumber(e.matchesPlayed) ?? asNumber(dig(e, "all", "played")) ?? 0,
      won: asNumber(e.won) ?? asNumber(e.win) ?? asNumber(e.wins) ?? 0,
      drawn: asNumber(e.drawn) ?? asNumber(e.draw) ?? asNumber(e.draws) ?? 0,
      lost: asNumber(e.lost) ?? asNumber(e.loss) ?? asNumber(e.losses) ?? 0,
      pointsFor: asNumber(e.pointsFor) ?? asNumber(e.goalsFor) ?? asNumber(e.triesFor) ?? 0,
      pointsAgainst: asNumber(e.pointsAgainst) ?? asNumber(e.goalsAgainst) ?? asNumber(e.triesAgainst) ?? 0,
      bonusOffensive: asNumber(e.bonusOffensive) ?? asNumber(e.tryBonus) ?? 0,
      bonusDefensive: asNumber(e.bonusDefensive) ?? asNumber(e.losingBonus) ?? 0,
      points: asNumber(e.points) ?? asNumber(e.pts) ?? 0,
    });
  });

  return { rows: rows.sort((a, b) => a.position - b.position), warnings };
}

// --- Le fournisseur ----------------------------------------------------------

export function createHighlightlyProvider(options: HighlightlyOptions): SportsDataProvider {
  const fetchJson = options.fetchJson ?? createJsonFetcher(HIGHLIGHTLY);
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const host = options.host ?? DEFAULT_HOST;
  const headers = {
    "x-rapidapi-key": options.apiKey,
    "x-rapidapi-host": host,
  };

  function buildUrl(path: string, params: Record<string, string>): string {
    const query = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    return `${baseUrl}/${path}?${query}`;
  }

  async function fetchApi(path: string, params: Record<string, string>): Promise<unknown> {
    return fetchJson(buildUrl(path, params), { headers });
  }

  return {
    name: HIGHLIGHTLY,
    dailyQuota: options.dailyQuota ?? HIGHLIGHTLY_FREE_QUOTA,

    async getFixtures(seasonExternalId: string, range: DateRange) {
      const { leagueId, season } = splitSeasonRef(seasonExternalId);
      const payload = await fetchApi("matches", {
        leagueId,
        season,
        fromDate: range.from,
        toDate: range.to,
      });
      const { fixtures, warnings } = parseHighlightlyMatches(payload);
      return { provider: HIGHLIGHTLY, data: fixtures, requestsUsed: 1, warnings };
    },

    async getLiveScores(seasonExternalId: string, date: string) {
      const { leagueId, season } = splitSeasonRef(seasonExternalId);
      const payload = await fetchApi("matches", {
        leagueId,
        season,
        date,
      });
      const { fixtures, warnings } = parseHighlightlyMatches(payload);
      return { provider: HIGHLIGHTLY, data: fixtures, requestsUsed: 1, warnings };
    },

    async getStandings(seasonExternalId: string) {
      const { leagueId, season } = splitSeasonRef(seasonExternalId);
      const payload = await fetchApi("standings", {
        leagueId,
        season,
      });
      const { rows, warnings } = parseHighlightlyStandings(payload);
      return { provider: HIGHLIGHTLY, data: rows, requestsUsed: 1, warnings };
    },
  };
}
