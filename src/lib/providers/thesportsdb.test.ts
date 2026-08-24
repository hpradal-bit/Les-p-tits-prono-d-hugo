import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapTheSportsDbStatus,
  parseTheSportsDbEvents,
  parseTheSportsDbStandings,
} from "./thesportsdb.ts";

// --- Statuts -----------------------------------------------------------------

test("mapTheSportsDbStatus : Match Finished → finished", () => {
  assert.equal(mapTheSportsDbStatus("Match Finished"), "finished");
});

test("mapTheSportsDbStatus : Not Started → scheduled", () => {
  assert.equal(mapTheSportsDbStatus("Not Started"), "scheduled");
});

test("mapTheSportsDbStatus : Live → live", () => {
  assert.equal(mapTheSportsDbStatus("Live"), "live");
});

test("mapTheSportsDbStatus : Postponed → postponed", () => {
  assert.equal(mapTheSportsDbStatus("Postponed"), "postponed");
});

test("mapTheSportsDbStatus : null ou vide → scheduled", () => {
  assert.equal(mapTheSportsDbStatus(null), "scheduled");
  assert.equal(mapTheSportsDbStatus(""), "scheduled");
});

// --- Parsing des événements --------------------------------------------------

const sampleEvents = {
  events: [
    {
      idEvent: "1234567",
      strEvent: "Toulouse vs Clermont",
      idHomeTeam: "100",
      strHomeTeam: "Stade Toulousain",
      idAwayTeam: "200",
      strAwayTeam: "ASM Clermont Auvergne",
      intHomeScore: "24",
      intAwayScore: "17",
      intRound: "3",
      dateEvent: "2026-09-19",
      strTime: "20:45:00+00:00",
      strTimestamp: "2026-09-19T20:45:00+00:00",
      strStatus: "Match Finished",
      strVenue: "Stadium de Toulouse",
    },
    {
      idEvent: "1234568",
      strEvent: "Racing 92 vs La Rochelle",
      idHomeTeam: "300",
      strHomeTeam: "Racing 92",
      idAwayTeam: "400",
      strAwayTeam: "Stade Rochelais",
      intHomeScore: null,
      intAwayScore: null,
      intRound: "3",
      dateEvent: "2026-09-20",
      strTime: "14:00:00+00:00",
      strTimestamp: "2026-09-20T14:00:00+00:00",
      strStatus: "Not Started",
      strVenue: "Paris La Défense Arena",
    },
  ],
};

test("parseTheSportsDbEvents : un match terminé porte ses scores", () => {
  const { fixtures, warnings } = parseTheSportsDbEvents(sampleEvents);
  assert.equal(fixtures.length, 2);
  assert.equal(warnings.length, 0);

  const finished = fixtures[0];
  assert.equal(finished.externalId, "1234567");
  assert.equal(finished.homeTeam.name, "Stade Toulousain");
  assert.equal(finished.awayTeam.name, "ASM Clermont Auvergne");
  assert.equal(finished.homeScore, 24);
  assert.equal(finished.awayScore, 17);
  assert.equal(finished.status, "finished");
  assert.equal(finished.venue, "Stadium de Toulouse");
  assert.equal(finished.roundLabel, "Round 3");
  assert.equal(finished.kickoffPrecise, true);
});

test("parseTheSportsDbEvents : un match à venir n'a pas de score", () => {
  const { fixtures } = parseTheSportsDbEvents(sampleEvents);
  const scheduled = fixtures[1];
  assert.equal(scheduled.status, "scheduled");
  assert.equal(scheduled.homeScore, null);
  assert.equal(scheduled.awayScore, null);
});

test("parseTheSportsDbEvents : un match sans horaire est imprécis", () => {
  const payload = {
    events: [{
      idEvent: "9",
      strEvent: "A vs B",
      idHomeTeam: "1", strHomeTeam: "A",
      idAwayTeam: "2", strAwayTeam: "B",
      intHomeScore: null, intAwayScore: null,
      intRound: "1",
      dateEvent: "2026-09-05",
      strTime: "00:00:00",
      strStatus: "Not Started",
    }],
  };
  const { fixtures } = parseTheSportsDbEvents(payload);
  assert.equal(fixtures[0].kickoffPrecise, false);
});

test("parseTheSportsDbEvents : événements vides → tableau vide sans erreur", () => {
  const { fixtures } = parseTheSportsDbEvents({ events: [] });
  assert.equal(fixtures.length, 0);
});

test("parseTheSportsDbEvents : réponse sans clé events → erreur", () => {
  assert.throws(() => parseTheSportsDbEvents({}), /events/);
});

// --- Parsing du classement ---------------------------------------------------

const sampleTable = {
  table: [
    {
      strTeam: "Stade Toulousain",
      idTeam: "100",
      intRank: 1,
      intPlayed: 10,
      intWin: 8,
      intDraw: 0,
      intLoss: 2,
      intGoalsFor: 245,
      intGoalsAgainst: 178,
      intPoints: 42,
    },
    {
      strTeam: "Union Bordeaux Bègles",
      idTeam: "101",
      intRank: 2,
      intPlayed: 10,
      intWin: 7,
      intDraw: 1,
      intLoss: 2,
      intGoalsFor: 230,
      intGoalsAgainst: 190,
      intPoints: 38,
    },
  ],
};

test("parseTheSportsDbStandings : deux lignes bien parsées", () => {
  const { rows, warnings } = parseTheSportsDbStandings(sampleTable);
  assert.equal(rows.length, 2);
  assert.equal(warnings.length, 0);

  assert.equal(rows[0].team.name, "Stade Toulousain");
  assert.equal(rows[0].position, 1);
  assert.equal(rows[0].played, 10);
  assert.equal(rows[0].won, 8);
  assert.equal(rows[0].points, 42);

  assert.equal(rows[1].team.name, "Union Bordeaux Bègles");
  assert.equal(rows[1].position, 2);
  assert.equal(rows[1].points, 38);
});

test("parseTheSportsDbStandings : table vide → erreur", () => {
  assert.throws(() => parseTheSportsDbStandings({ table: [] }), /aucune entrée/);
});

test("parseTheSportsDbStandings : format SDK (name/played/win/total)", () => {
  const sdk = {
    table: [{
      name: "Pau",
      teamid: "42",
      played: 10,
      win: 5,
      draw: 2,
      loss: 3,
      goalsfor: 180,
      goalsagainst: 160,
      total: 28,
    }],
  };
  const { rows } = parseTheSportsDbStandings(sdk);
  assert.equal(rows[0].team.name, "Pau");
  assert.equal(rows[0].played, 10);
  assert.equal(rows[0].points, 28);
});
