/**
 * Fournisseur principal : TheSportsDB (v1, gratuit).
 *
 * 30 requêtes par minute, pas de quota journalier. Les scores en direct sont
 * décalés de 5 à 10 minutes sur l'offre gratuite — acceptable pour des
 * pronostics entre amis, pas pour du trading sportif.
 *
 * L'identifiant de ligue (4430 pour le Top 14, 5172 pour la Pro D2) vit dans
 * `external_refs` : rien n'est écrit en dur ici.
 *
 * Le `seasonExternalId` attendu est au format `{leagueId}:{season}`, par
 * exemple `4430:2026-2027`. Le séparateur `:` permet de transporter les deux
 * valeurs dans une seule colonne d'`external_refs`, comme API-Sports le fait
 * déjà avec `16:2026`.
 */

import {
  asArray,
  asNumber,
  asRecord,
  asString,
  createJsonFetcher,
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

export const THESPORTSDB = "thesportsdb";

const DEFAULT_BASE_URL = "https://www.thesportsdb.com/api/v1/json";

export interface TheSportsDbOptions {
  apiKey?: string;
  fetchJson?: JsonFetcher;
  baseUrl?: string;
}

// --- Découpage du seasonExternalId -------------------------------------------

function splitSeasonRef(ref: string): { leagueId: string; season: string } {
  const sep = ref.indexOf(":");
  if (sep < 1) {
    throw new ProviderError(THESPORTSDB, `référence de saison invalide : « ${ref} » (attendu leagueId:season)`);
  }
  return { leagueId: ref.slice(0, sep), season: ref.slice(sep + 1) };
}

// --- Analyse des réponses (pure, défensive) ----------------------------------

export function mapTheSportsDbStatus(raw: unknown): FixtureStatus {
  const s = (asString(raw) ?? "").toLowerCase().trim();
  if (!s || s === "not started" || s === "ns") return "scheduled";
  if (s.includes("live") || s === "1h" || s === "2h" || s === "ht" || s === "in progress") return "live";
  if (s.includes("finished") || s === "ft" || s === "match finished" || s === "aet" || s === "ap") return "finished";
  if (s.includes("postponed") || s === "pst" || s === "delayed") return "postponed";
  if (s.includes("cancel") || s.includes("abandon") || s === "canc" || s === "abd") return "cancelled";
  // Un statut inconnu est traité comme programmé plutôt que de tout casser.
  return "scheduled";
}

function parseTeam(
  id: unknown,
  name: unknown,
): ProviderTeam | null {
  const teamName = asString(name);
  if (!teamName) return null;
  return {
    externalId: asString(id),
    name: teamName,
    aliases: [],
  };
}

function parseKickoff(
  dateStr: unknown,
  timeStr: unknown,
  timestampStr: unknown,
): { iso: string; precise: boolean } | null {
  // strTimestamp est un ISO complet (« 2026-09-19T20:45:00+00:00 ») : on le
  // préfère, il n'a pas besoin d'être combiné avec dateEvent.
  const ts = asString(timestampStr);
  if (ts) {
    const parsed = new Date(ts);
    if (!Number.isNaN(parsed.getTime())) {
      const precise = !(parsed.getUTCHours() === 0 && parsed.getUTCMinutes() === 0);
      return { iso: parsed.toISOString(), precise };
    }
  }

  const d = asString(dateStr);
  if (!d) return null;

  const t = asString(timeStr);
  const hasTime = t != null && !/^00:00(:00)?(\+.*)?$/.test(t.trim());

  let iso: string;
  if (hasTime) {
    const combined = t.includes("+") || t.includes("Z") ? `${d}T${t}` : `${d}T${t}+00:00`;
    const parsed = new Date(combined);
    if (Number.isNaN(parsed.getTime())) return null;
    iso = parsed.toISOString();
  } else {
    const parsed = new Date(`${d}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    iso = parsed.toISOString();
  }

  return { iso, precise: hasTime };
}

export function parseTheSportsDbEvents(payload: unknown): {
  fixtures: ProviderFixture[];
  warnings: string[];
} {
  const root = asRecord(payload);
  if (!root) throw new ProviderError(THESPORTSDB, "réponse vide ou non exploitable");

  const events = asArray(root.events);
  if (events.length === 0 && !("events" in root)) {
    throw new ProviderError(THESPORTSDB, "champ `events` absent : format inattendu");
  }

  const warnings: string[] = [];
  const fixtures: ProviderFixture[] = [];

  for (const event of events) {
    const e = asRecord(event);
    if (!e) continue;

    const externalId = asString(e.idEvent);
    if (!externalId) {
      warnings.push("match ignoré : identifiant absent");
      continue;
    }

    const kickoff = parseKickoff(e.dateEvent, e.strTime, e.strTimestamp);
    if (!kickoff) {
      warnings.push(`match ${externalId} ignoré : date illisible`);
      continue;
    }

    const home = parseTeam(e.idHomeTeam, e.strHomeTeam);
    const away = parseTeam(e.idAwayTeam, e.strAwayTeam);
    if (!home || !away) {
      warnings.push(`match ${externalId} ignoré : équipes illisibles`);
      continue;
    }

    const status = mapTheSportsDbStatus(e.strStatus);
    const homeScore = asNumber(e.intHomeScore);
    const awayScore = asNumber(e.intAwayScore);
    const scoresKnown = status !== "scheduled" && homeScore !== null && awayScore !== null;

    const roundLabel = asString(e.intRound);

    fixtures.push({
      externalId,
      kickoffAt: kickoff.iso,
      kickoffPrecise: kickoff.precise,
      status,
      homeTeam: home,
      awayTeam: away,
      homeScore: scoresKnown ? homeScore : null,
      awayScore: scoresKnown ? awayScore : null,
      minute: null, // v1 ne donne pas la minute de jeu
      venue: asString(e.strVenue),
      roundLabel: roundLabel ? `Round ${roundLabel}` : null,
    });
  }

  return { fixtures, warnings };
}

export function parseTheSportsDbStandings(payload: unknown): {
  rows: ProviderStandingRow[];
  warnings: string[];
} {
  const root = asRecord(payload);
  if (!root) throw new ProviderError(THESPORTSDB, "classement vide ou non exploitable");

  const table = asArray(root.table);
  if (table.length === 0) throw new ProviderError(THESPORTSDB, "aucune entrée de classement trouvée");

  const warnings: string[] = [];
  const rows: ProviderStandingRow[] = [];

  table.forEach((entry, index) => {
    const e = asRecord(entry);
    if (!e) return;

    // Le champ équipe peut être « name » (SDK) ou « strTeam » (API brute).
    const teamName = asString(e.strTeam) ?? asString(e.name);
    const teamId = asString(e.idTeam) ?? asString(e.teamid);

    if (!teamName) {
      warnings.push("ligne de classement ignorée : équipe illisible");
      return;
    }

    rows.push({
      team: {
        externalId: teamId,
        name: teamName,
        aliases: [],
      },
      position: asNumber(e.intRank) ?? index + 1,
      played: asNumber(e.intPlayed) ?? asNumber(e.played) ?? 0,
      won: asNumber(e.intWin) ?? asNumber(e.win) ?? 0,
      drawn: asNumber(e.intDraw) ?? asNumber(e.draw) ?? 0,
      lost: asNumber(e.intLoss) ?? asNumber(e.loss) ?? 0,
      pointsFor: asNumber(e.intGoalsFor) ?? asNumber(e.goalsfor) ?? 0,
      pointsAgainst: asNumber(e.intGoalsAgainst) ?? asNumber(e.goalsagainst) ?? 0,
      // TheSportsDB ne distingue pas les bonus : on met zéro.
      bonusOffensive: 0,
      bonusDefensive: 0,
      points: asNumber(e.intPoints) ?? asNumber(e.total) ?? 0,
    });
  });

  return { rows: rows.sort((a, b) => a.position - b.position), warnings };
}

// --- Le fournisseur ----------------------------------------------------------

export function createTheSportsDbProvider(options: TheSportsDbOptions = {}): SportsDataProvider {
  const apiKey = options.apiKey ?? "123";
  const fetchJson = options.fetchJson ?? createJsonFetcher(THESPORTSDB);
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");

  function url(endpoint: string, params: Record<string, string>): string {
    const query = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    return `${baseUrl}/${encodeURIComponent(apiKey)}/${endpoint}?${query}`;
  }

  return {
    name: THESPORTSDB,
    dailyQuota: null, // quota en req/min, pas en req/jour

    async getFixtures(seasonExternalId: string, range: DateRange) {
      const { leagueId, season } = splitSeasonRef(seasonExternalId);
      const payload = await fetchJson(url("eventsseason.php", { id: leagueId, s: season }));
      const { fixtures: all, warnings } = parseTheSportsDbEvents(payload);

      // Filtrer sur la plage demandée.
      const from = new Date(`${range.from}T00:00:00Z`).getTime();
      const to = new Date(`${range.to}T23:59:59.999Z`).getTime();
      const fixtures = all.filter((f) => {
        const t = new Date(f.kickoffAt).getTime();
        return t >= from && t <= to;
      });

      return { provider: THESPORTSDB, data: fixtures, requestsUsed: 1, warnings };
    },

    async getLiveScores(seasonExternalId: string, date: string) {
      const { leagueId, season } = splitSeasonRef(seasonExternalId);
      // eventsround pourrait marcher, mais on ne connaît pas le numéro de
      // journée. eventsseason ramène toute la saison : on filtre sur le jour.
      const payload = await fetchJson(url("eventsseason.php", { id: leagueId, s: season }));
      const { fixtures: all, warnings } = parseTheSportsDbEvents(payload);

      const target = date.replace(/-/g, "");
      const fixtures = all.filter((f) => {
        const d = f.kickoffAt.slice(0, 10).replace(/-/g, "");
        return d === target;
      });

      return { provider: THESPORTSDB, data: fixtures, requestsUsed: 1, warnings };
    },

    async getStandings(seasonExternalId: string) {
      const { leagueId, season } = splitSeasonRef(seasonExternalId);
      const payload = await fetchJson(url("lookuptable.php", { l: leagueId, s: season }));
      const { rows, warnings } = parseTheSportsDbStandings(payload);
      return { provider: THESPORTSDB, data: rows, requestsUsed: 1, warnings };
    },
  };
}
