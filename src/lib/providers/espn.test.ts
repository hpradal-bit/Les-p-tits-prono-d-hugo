import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createEspnProvider,
  isPreciseKickoff,
  mapEspnStatus,
  parseEspnScoreboard,
  parseEspnStandings,
} from "./espn.ts";
import {
  espnPostponedSample,
  espnScoreboardSample,
  espnScoreboardWithoutTimeSample,
  espnStandingsSample,
} from "./samples/espn-scoreboard.ts";

// --- Analyse du tableau de scores -------------------------------------------

test("ESPN : les trois matchs de l'échantillon sont lus", () => {
  const { fixtures, warnings } = parseEspnScoreboard(espnScoreboardSample);
  assert.equal(fixtures.length, 3);
  assert.deepEqual(warnings, []);
});

test("ESPN : un match à venir garde son horaire et n'invente pas de score", () => {
  const [match] = parseEspnScoreboard(espnScoreboardSample).fixtures;
  assert.equal(match.externalId, "600123");
  assert.equal(match.kickoffAt, "2026-09-05T19:05:00.000Z");
  assert.equal(match.kickoffPrecise, true);
  assert.equal(match.status, "scheduled");
  assert.equal(match.homeTeam.name, "Stade Toulousain");
  assert.equal(match.awayTeam.name, "ASM Clermont Auvergne");
  // 0-0 avant le coup d'envoi n'est pas un score : c'est l'absence de score.
  assert.equal(match.homeScore, null);
  assert.equal(match.awayScore, null);
  assert.equal(match.venue, "Stade Ernest-Wallon");
});

test("ESPN : un match en cours donne le score et la minute (horloge en secondes)", () => {
  const match = parseEspnScoreboard(espnScoreboardSample).fixtures[1];
  assert.equal(match.status, "live");
  assert.equal(match.homeScore, 17);
  assert.equal(match.awayScore, 12);
  assert.equal(match.minute, 53); // 3180 secondes
});

test("ESPN : un match terminé conserve un nul 27-27", () => {
  const match = parseEspnScoreboard(espnScoreboardSample).fixtures[2];
  assert.equal(match.status, "finished");
  assert.equal(match.homeScore, 27);
  assert.equal(match.awayScore, 27);
  assert.equal(match.minute, null);
});

test("ESPN : minuit UTC = date sans horaire, l'horaire reste provisoire", () => {
  const [match] = parseEspnScoreboard(espnScoreboardWithoutTimeSample).fixtures;
  assert.equal(match.kickoffPrecise, false);
  assert.equal(isPreciseKickoff("2027-01-09T00:00:00.000Z"), false);
  assert.equal(isPreciseKickoff("2027-01-09T15:00:00.000Z"), true);
});

test("ESPN : un match reporté est reconnu comme tel", () => {
  const [match] = parseEspnScoreboard(espnPostponedSample).fixtures;
  assert.equal(match.status, "postponed");
});

test("ESPN : la table des statuts couvre les cas connus", () => {
  assert.equal(mapEspnStatus("pre", "STATUS_SCHEDULED", false), "scheduled");
  assert.equal(mapEspnStatus("in", "STATUS_IN_PROGRESS", false), "live");
  assert.equal(mapEspnStatus("post", "STATUS_FINAL", true), "finished");
  assert.equal(mapEspnStatus("post", "STATUS_POSTPONED", false), "postponed");
  assert.equal(mapEspnStatus("post", "STATUS_CANCELED", false), "cancelled");
  // Un état inconnu ne casse rien : on reste sur « à venir ».
  assert.equal(mapEspnStatus("quelque-chose-de-nouveau", null, null), "scheduled");
});

// --- Robustesse : l'API peut changer sans préavis ---------------------------

test("ESPN : une réponse vide lève une erreur de fournisseur", () => {
  assert.throws(() => parseEspnScoreboard(null), /espn/);
  assert.throws(() => parseEspnScoreboard({ resultats: [] }), /events/);
});

test("ESPN : un match illisible est ignoré, les autres passent", () => {
  const payload = {
    events: [
      { id: "1", date: "pas-une-date", competitions: [] },
      { competitions: [{ date: "2026-09-05T19:05Z" }] }, // pas d'identifiant
      espnScoreboardSample.events[2],
    ],
  };
  const { fixtures, warnings } = parseEspnScoreboard(payload);
  assert.equal(fixtures.length, 1);
  assert.equal(warnings.length, 2);
});

test("ESPN : un match sans équipes lisibles est signalé, pas deviné", () => {
  const payload = {
    events: [
      {
        id: "42",
        date: "2026-09-05T19:05Z",
        competitions: [{ date: "2026-09-05T19:05Z", competitors: [] }],
      },
    ],
  };
  const { fixtures, warnings } = parseEspnScoreboard(payload);
  assert.equal(fixtures.length, 0);
  assert.match(warnings[0], /équipes illisibles/);
});

// --- Classement --------------------------------------------------------------

test("ESPN : le classement est lu et trié par position", () => {
  const { rows } = parseEspnStandings(espnStandingsSample);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].team.name, "Stade Toulousain");
  assert.equal(rows[0].position, 1);
  assert.equal(rows[0].played, 3);
  assert.equal(rows[0].won, 3);
  assert.equal(rows[0].pointsFor, 97);
  assert.equal(rows[0].bonusOffensive, 2);
  assert.equal(rows[0].points, 14);
  // Statistique absente = 0, jamais NaN.
  assert.equal(rows[1].bonusOffensive, 0);
  assert.equal(rows[1].drawn, 1);
});

test("ESPN : un classement sans entrées lève une erreur", () => {
  assert.throws(() => parseEspnStandings({ children: [] }), /classement/);
});

// --- Le fournisseur : construction des URL ----------------------------------

test("ESPN : la plage de dates est passée au format AAAAMMJJ-AAAAMMJJ", async () => {
  const calls: string[] = [];
  const provider = createEspnProvider({
    fetchJson: async (url) => {
      calls.push(url);
      return espnScoreboardSample;
    },
  });

  const result = await provider.getFixtures("270559", { from: "2026-09-01", to: "2026-09-30" });
  assert.match(calls[0], /\/270559\/scoreboard\?dates=20260901-20260930/);
  assert.equal(result.provider, "espn");
  assert.equal(result.requestsUsed, 1);
  assert.equal(result.data.length, 3);
});

test("ESPN : le direct interroge une seule journée", async () => {
  const calls: string[] = [];
  const provider = createEspnProvider({
    fetchJson: async (url) => {
      calls.push(url);
      return espnScoreboardSample;
    },
  });
  await provider.getLiveScores("270559", "2026-09-05");
  assert.match(calls[0], /dates=20260905(&|$)/);
});

test("ESPN : aucun identifiant de ligue n'est codé en dur dans le module", async () => {
  const calls: string[] = [];
  const provider = createEspnProvider({
    fetchJson: async (url) => {
      calls.push(url);
      return espnStandingsSample;
    },
  });
  await provider.getStandings("999999");
  assert.match(calls[0], /\/999999\/standings/);
  assert.equal(provider.dailyQuota, null);
});
