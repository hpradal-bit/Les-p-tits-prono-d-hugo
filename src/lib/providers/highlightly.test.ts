import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseHighlightlyMatches,
  parseHighlightlyStandings,
} from "./highlightly.ts";

// --- Parsing des matchs ------------------------------------------------------

test("parseHighlightlyMatches : format objet avec clé matches", () => {
  const payload = {
    matches: [
      {
        id: "42",
        date: "2026-09-05T20:45:00Z",
        homeTeam: { id: "1", name: "Stade Toulousain" },
        awayTeam: { id: "2", name: "ASM Clermont" },
        homeScore: 31,
        awayScore: 24,
        status: "Finished",
        venue: "Stadium de Toulouse",
        round: "Round 1",
      },
    ],
  };
  const { fixtures, warnings } = parseHighlightlyMatches(payload);
  assert.equal(fixtures.length, 1);
  assert.equal(warnings.length, 0);

  const f = fixtures[0];
  assert.equal(f.externalId, "42");
  assert.equal(f.homeTeam.name, "Stade Toulousain");
  assert.equal(f.awayTeam.name, "ASM Clermont");
  assert.equal(f.homeScore, 31);
  assert.equal(f.awayScore, 24);
  assert.equal(f.status, "finished");
  assert.equal(f.kickoffPrecise, true);
  assert.equal(f.roundLabel, "Round 1");
});

test("parseHighlightlyMatches : format tableau direct", () => {
  const payload = [
    {
      id: "10",
      date: "2026-09-06T14:00:00Z",
      homeTeam: { id: "3", name: "Racing 92" },
      awayTeam: { id: "4", name: "Stade Rochelais" },
      status: "Not Started",
    },
  ];
  const { fixtures } = parseHighlightlyMatches(payload);
  assert.equal(fixtures.length, 1);
  assert.equal(fixtures[0].status, "scheduled");
  assert.equal(fixtures[0].homeScore, null);
});

test("parseHighlightlyMatches : format avec clé data", () => {
  const payload = {
    data: [{
      id: "20",
      date: "2026-09-06T16:00:00Z",
      home_team: { id: "5", name: "Castres" },
      away_team: { id: "6", name: "Bayonne" },
      home_score: 18,
      away_score: 15,
      status: "FT",
    }],
  };
  const { fixtures } = parseHighlightlyMatches(payload);
  assert.equal(fixtures.length, 1);
  assert.equal(fixtures[0].status, "finished");
  assert.equal(fixtures[0].homeScore, 18);
});

test("parseHighlightlyMatches : match en cours avec minute", () => {
  const payload = {
    matches: [{
      id: "30",
      date: "2026-09-05T20:45:00Z",
      homeTeam: { id: "1", name: "Toulouse" },
      awayTeam: { id: "2", name: "Clermont" },
      homeScore: 14,
      awayScore: 7,
      status: "Live",
      minute: 52,
    }],
  };
  const { fixtures } = parseHighlightlyMatches(payload);
  assert.equal(fixtures[0].status, "live");
  assert.equal(fixtures[0].minute, 52);
});

test("parseHighlightlyMatches : réponse vide → erreur", () => {
  assert.throws(() => parseHighlightlyMatches({}), /aucune clé/);
});

// --- Parsing du classement ---------------------------------------------------

test("parseHighlightlyStandings : format tableau direct", () => {
  const payload = [
    {
      team: { id: "1", name: "Stade Toulousain" },
      position: 1,
      played: 10,
      won: 8,
      drawn: 0,
      lost: 2,
      pointsFor: 245,
      pointsAgainst: 178,
      points: 42,
    },
    {
      team: { id: "2", name: "UBB" },
      position: 2,
      played: 10,
      won: 7,
      drawn: 1,
      lost: 2,
      points: 38,
    },
  ];
  const { rows, warnings } = parseHighlightlyStandings(payload);
  assert.equal(rows.length, 2);
  assert.equal(warnings.length, 0);
  assert.equal(rows[0].team.name, "Stade Toulousain");
  assert.equal(rows[0].position, 1);
  assert.equal(rows[0].points, 42);
  assert.equal(rows[1].team.name, "UBB");
});

test("parseHighlightlyStandings : format avec clé standings", () => {
  const payload = {
    standings: [{
      name: "Pau",
      id: "42",
      position: 7,
      played: 10,
      won: 4,
      drawn: 1,
      lost: 5,
      points: 22,
    }],
  };
  const { rows } = parseHighlightlyStandings(payload);
  assert.equal(rows[0].team.name, "Pau");
  assert.equal(rows[0].position, 7);
  assert.equal(rows[0].points, 22);
});

test("parseHighlightlyStandings : classement groupé par conférence", () => {
  const payload = {
    standings: [
      {
        table: [
          { team: { id: "1", name: "A" }, position: 1, played: 5, won: 5, points: 25 },
          { team: { id: "2", name: "B" }, position: 2, played: 5, won: 3, points: 18 },
        ],
      },
    ],
  };
  const { rows } = parseHighlightlyStandings(payload);
  assert.equal(rows.length, 2);
});

test("parseHighlightlyStandings : réponse vide → erreur", () => {
  assert.throws(() => parseHighlightlyStandings({ standings: [] }), /vide/);
});
