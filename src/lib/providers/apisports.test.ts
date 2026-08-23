import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createApiSportsProvider,
  mapApiSportsStatus,
  parseApiSportsGames,
  parseApiSportsStandings,
  splitSeasonRef,
} from "./apisports.ts";
import {
  apiSportsGamesSample,
  apiSportsQuotaErrorSample,
  apiSportsStandingsSample,
} from "./samples/apisports-games.ts";

// --- Analyse des matchs ------------------------------------------------------

test("API-Sports : les trois matchs de l'échantillon sont lus", () => {
  const { fixtures, warnings } = parseApiSportsGames(apiSportsGamesSample);
  assert.equal(fixtures.length, 3);
  assert.deepEqual(warnings, []);
});

test("API-Sports : l'horodatage donne un coup d'envoi précis en UTC", () => {
  const [match] = parseApiSportsGames(apiSportsGamesSample).fixtures;
  assert.equal(match.externalId, "77001");
  // 21 h 05 à Paris (UTC+2) = 19 h 05 UTC.
  assert.equal(match.kickoffAt, "2026-09-05T19:05:00.000Z");
  assert.equal(match.kickoffPrecise, true);
  assert.equal(match.status, "scheduled");
  assert.equal(match.homeScore, null);
});

test("API-Sports : un match en cours donne le score et le chrono", () => {
  const match = parseApiSportsGames(apiSportsGamesSample).fixtures[1];
  assert.equal(match.status, "live");
  assert.equal(match.homeScore, 17);
  assert.equal(match.awayScore, 12);
  assert.equal(match.minute, 53);
});

test("API-Sports : un match terminé garde son score", () => {
  const match = parseApiSportsGames(apiSportsGamesSample).fixtures[2];
  assert.equal(match.status, "finished");
  assert.equal(match.homeScore, 27);
  assert.equal(match.awayScore, 27);
  assert.equal(match.minute, null);
});

test("API-Sports : la table des statuts couvre les codes courts", () => {
  assert.equal(mapApiSportsStatus("NS"), "scheduled");
  assert.equal(mapApiSportsStatus("1H"), "live");
  assert.equal(mapApiSportsStatus("HT"), "live");
  assert.equal(mapApiSportsStatus("FT"), "finished");
  assert.equal(mapApiSportsStatus("AET"), "finished");
  assert.equal(mapApiSportsStatus("PST"), "postponed");
  assert.equal(mapApiSportsStatus("CANC"), "cancelled");
  assert.equal(mapApiSportsStatus("code-inconnu"), "scheduled");
});

test("API-Sports : une erreur renvoyée en HTTP 200 est bien une erreur", () => {
  // Le piège du fournisseur : quota épuisé, statut 200, `response` vide.
  assert.throws(
    () => parseApiSportsGames(apiSportsQuotaErrorSample),
    /request limit for the day/,
  );
});

test("API-Sports : une enveloppe sans `response` est refusée", () => {
  assert.throws(() => parseApiSportsGames({ errors: [], results: 0 }), /response/);
  assert.throws(() => parseApiSportsGames(null), /apisports/);
});

test("API-Sports : un match incomplet est ignoré, pas deviné", () => {
  const payload = {
    errors: [],
    response: [
      { id: 1 }, // ni date ni équipes
      { id: 2, timestamp: 1788635100, teams: { home: { id: 9 } } }, // équipe sans nom
      apiSportsGamesSample.response[2],
    ],
  };
  const { fixtures, warnings } = parseApiSportsGames(payload);
  assert.equal(fixtures.length, 1);
  assert.equal(warnings.length, 2);
});

// --- Classement --------------------------------------------------------------

test("API-Sports : le classement est lu, groupes aplatis", () => {
  const { rows } = parseApiSportsStandings(apiSportsStandingsSample);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].team.name, "Stade Toulousain");
  assert.equal(rows[0].won, 3);
  assert.equal(rows[0].pointsFor, 97);
  assert.equal(rows[0].bonusOffensive, 2);
  assert.equal(rows[0].points, 14);
  assert.equal(rows[1].drawn, 1);
  assert.equal(rows[1].points, 11);
});

// --- Le fournisseur : quota et URL ------------------------------------------

test("API-Sports : la référence de saison a la forme ligue:saison", () => {
  assert.deepEqual(splitSeasonRef("16:2026"), { league: "16", season: "2026" });
  assert.throws(() => splitSeasonRef("16"), /ligue:saison/);
  assert.throws(() => splitSeasonRef(""), /ligue:saison/);
});

test("API-Sports : la clé passe en en-tête, jamais dans l'URL", async () => {
  let seenUrl = "";
  let seenHeaders: Record<string, string> = {};
  const provider = createApiSportsProvider({
    apiKey: "clef-secrete",
    fetchJson: async (url, options) => {
      seenUrl = url;
      seenHeaders = options?.headers ?? {};
      return apiSportsGamesSample;
    },
  });

  await provider.getLiveScores("16:2026", "2026-09-05");
  assert.equal(seenHeaders["x-apisports-key"], "clef-secrete");
  assert.ok(!seenUrl.includes("clef-secrete"));
  assert.match(seenUrl, /league=16&season=2026&date=2026-09-05/);
});

test("API-Sports : le calendrier tient en une requête, filtrée ensuite", async () => {
  let calls = 0;
  const provider = createApiSportsProvider({
    apiKey: "k",
    fetchJson: async () => {
      calls += 1;
      return apiSportsGamesSample;
    },
  });

  // Une plage d'un jour : un seul appel, quel que soit le nombre de jours.
  const result = await provider.getFixtures("16:2026", { from: "2026-09-05", to: "2026-09-05" });
  assert.equal(calls, 1);
  assert.equal(result.requestsUsed, 1);
  assert.equal(result.data.length, 3);

  // Hors plage : rien ne remonte, mais la requête a bien été comptée.
  const empty = await provider.getFixtures("16:2026", { from: "2026-10-01", to: "2026-10-02" });
  assert.equal(empty.data.length, 0);
  assert.equal(empty.requestsUsed, 1);
});

test("API-Sports : le quota gratuit par défaut est de 100 requêtes par jour", () => {
  const provider = createApiSportsProvider({ apiKey: "k" });
  assert.equal(provider.dailyQuota, 100);
  assert.equal(createApiSportsProvider({ apiKey: "k", dailyQuota: 7500 }).dailyQuota, 7500);
});
