import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeCompetitionTable,
  RUGBY_TABLE_RULE,
  type PlayedFixture,
} from "./competition-table.ts";
import type { Team } from "@/lib/types";

function team(id: string, shortName: string): Team {
  return {
    id,
    code: shortName,
    name: shortName,
    shortName,
    city: null,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
  };
}

const TEAMS = [team("a", "AAA"), team("b", "BBB"), team("c", "CCC")];

function fx(h: string, a: string, hs: number, as: number): PlayedFixture {
  return { homeTeamId: h, awayTeamId: a, homeScore: hs, awayScore: as };
}

test("une victoire rapporte 4 points, une défaite large 0", () => {
  const table = computeCompetitionTable(TEAMS, [fx("a", "b", 30, 10)]);
  const a = table.find((r) => r.team.id === "a")!;
  const b = table.find((r) => r.team.id === "b")!;

  assert.equal(a.points, 4);
  assert.equal(a.won, 1);
  assert.equal(a.pointsFor, 30);
  assert.equal(a.pointsAgainst, 10);

  assert.equal(b.points, 0);
  assert.equal(b.lost, 1);
  assert.equal(b.bonusDefensive, 0);
});

test("une défaite de 7 points ou moins rapporte le bonus défensif", () => {
  const table = computeCompetitionTable(TEAMS, [fx("a", "b", 20, 13)]);
  const b = table.find((r) => r.team.id === "b")!;
  assert.equal(b.bonusDefensive, 1);
  assert.equal(b.points, 1);
});

test("une défaite de 8 points ne rapporte rien", () => {
  const table = computeCompetitionTable(TEAMS, [fx("a", "b", 21, 13)]);
  const b = table.find((r) => r.team.id === "b")!;
  assert.equal(b.bonusDefensive, 0);
  assert.equal(b.points, 0);
});

test("un match nul rapporte 2 points à chacun, sans bonus", () => {
  const table = computeCompetitionTable(TEAMS, [fx("a", "b", 15, 15)]);
  for (const id of ["a", "b"]) {
    const r = table.find((x) => x.team.id === id)!;
    assert.equal(r.points, 2);
    assert.equal(r.drawn, 1);
    assert.equal(r.bonusDefensive, 0);
  }
});

test("le bonus offensif reste à zéro — les essais ne sont pas connus", () => {
  // Limite assumée et documentée : sans le nombre d'essais, ce bonus est
  // inatteignable. Le test verrouille le fait qu'on n'invente rien.
  const table = computeCompetitionTable(TEAMS, [fx("a", "b", 60, 0)]);
  assert.equal(table.find((r) => r.team.id === "a")!.bonusOffensive, 0);
});

test("les équipes sans match joué figurent quand même, à zéro", () => {
  const table = computeCompetitionTable(TEAMS, [fx("a", "b", 20, 10)]);
  assert.equal(table.length, 3);
  const c = table.find((r) => r.team.id === "c")!;
  assert.equal(c.played, 0);
  assert.equal(c.points, 0);
});

test("départage : points, puis différence, puis points marqués", () => {
  // A et B finissent à 4 points chacun ; A a la meilleure différence.
  const table = computeCompetitionTable(TEAMS, [
    fx("a", "c", 40, 0), // A : +40
    fx("b", "c", 20, 10), // B : +10
  ]);
  assert.equal(table[0].team.id, "a");
  assert.equal(table[1].team.id, "b");
  assert.equal(table[2].team.id, "c");
});

test("les positions sont contiguës à partir de 1", () => {
  const table = computeCompetitionTable(TEAMS, [fx("a", "b", 20, 10)]);
  assert.deepEqual(table.map((r) => r.position), [1, 2, 3]);
});

test("un match avec une équipe hors saison est ignoré", () => {
  const table = computeCompetitionTable(TEAMS, [fx("a", "inconnu", 30, 0)]);
  assert.equal(table.find((r) => r.team.id === "a")!.played, 0);
});

test("le barème est injectable — rien n'est codé en dur pour le rugby", () => {
  const football = {
    win: 3,
    draw: 1,
    loss: 0,
    losingBonusWithin: 0,
    losingBonusPoints: 0,
  };
  const table = computeCompetitionTable(TEAMS, [fx("a", "b", 2, 1)], football);
  assert.equal(table.find((r) => r.team.id === "a")!.points, 3);
  assert.equal(table.find((r) => r.team.id === "b")!.points, 0);
});

test("le barème rugby par défaut est bien celui du Top 14", () => {
  assert.equal(RUGBY_TABLE_RULE.win, 4);
  assert.equal(RUGBY_TABLE_RULE.draw, 2);
  assert.equal(RUGBY_TABLE_RULE.losingBonusWithin, 7);
});
