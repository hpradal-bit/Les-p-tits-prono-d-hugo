import { test } from "node:test";
import assert from "node:assert/strict";
import { chronological, isGood, playerStreaks, streakOf, streaksBySeason } from "./streaks.ts";
import type { ScoreEntry } from "../standings/engine.ts";
import type { ScoreLevel } from "../types.ts";

// `streaks.ts` et le moteur de classement dont il dépend n'importent plus rien
// par l'alias `@/` : le lanceur de Node charge donc le vrai fichier, et ce test
// vérifie le code livré plutôt qu'une copie.

const POINTS: Record<ScoreLevel, number> = {
  wrong: 0,
  winner: 1,
  winner_and_margin: 3,
  exact_score: 10,
};

function entry(
  level: ScoreLevel,
  kickoffAt = "2026-09-05T20:00:00Z",
  fixtureId = "f1",
  overrides: Partial<ScoreEntry> = {},
): ScoreEntry {
  return {
    userId: "alice",
    roundId: "r1",
    fixtureId,
    kickoffAt,
    fixtureStatus: "official",
    points: POINTS[level],
    level,
    ...overrides,
  };
}

// --- streakOf ----------------------------------------------------------------

test("streakOf : serie vide", () => {
  const s = streakOf([]);
  assert.equal(s.current, 0);
  assert.equal(s.best, 0);
});

test("streakOf : tout bon", () => {
  const s = streakOf([true, true, true]);
  assert.equal(s.current, 3);
  assert.equal(s.best, 3);
});

test("streakOf : tout rate", () => {
  const s = streakOf([false, false, false]);
  assert.equal(s.current, 0);
  assert.equal(s.best, 0);
});

test("streakOf : record ancien, serie en cours plus courte", () => {
  const s = streakOf([true, true, true, false, true, true]);
  assert.equal(s.current, 2);
  assert.equal(s.best, 3);
});

test("streakOf : la serie en cours est aussi le record", () => {
  const s = streakOf([false, true, true, true, true]);
  assert.equal(s.current, 4);
  assert.equal(s.best, 4);
});

test("streakOf : alternance", () => {
  const s = streakOf([true, false, true, false, true]);
  assert.equal(s.current, 1);
  assert.equal(s.best, 1);
});

test("streakOf : un seul element vrai", () => {
  const s = streakOf([true]);
  assert.equal(s.current, 1);
  assert.equal(s.best, 1);
});

test("streakOf : un seul element faux", () => {
  const s = streakOf([false]);
  assert.equal(s.current, 0);
  assert.equal(s.best, 0);
});

// --- isGood ------------------------------------------------------------------

test("isGood : winner est bon", () => {
  assert.equal(isGood(entry("winner")), true);
});

test("isGood : exact_score est bon", () => {
  assert.equal(isGood(entry("exact_score")), true);
});

test("isGood : winner_and_margin est bon", () => {
  assert.equal(isGood(entry("winner_and_margin")), true);
});

test("isGood : wrong est mauvais", () => {
  assert.equal(isGood(entry("wrong")), false);
});

// --- chronological -----------------------------------------------------------

test("chronological : tri par date puis par id", () => {
  const entries = [
    entry("winner", "2026-09-06T14:00:00Z", "f3"),
    entry("wrong", "2026-09-05T20:00:00Z", "f2"),
    entry("winner", "2026-09-05T20:00:00Z", "f1"),
  ];
  const sorted = chronological(entries);
  assert.equal(sorted[0].fixtureId, "f1");
  assert.equal(sorted[1].fixtureId, "f2");
  assert.equal(sorted[2].fixtureId, "f3");
});

test("chronological : ne modifie pas le tableau original", () => {
  const entries = [
    entry("winner", "2026-09-06T14:00:00Z", "f2"),
    entry("wrong", "2026-09-05T20:00:00Z", "f1"),
  ];
  const sorted = chronological(entries);
  assert.equal(entries[0].fixtureId, "f2");
  assert.equal(sorted[0].fixtureId, "f1");
});

// --- Integration : serie de bons et de mauvais --------------------------------

test("serie complete : 3 bons, 1 rate, 2 bons", () => {
  const entries = [
    entry("winner", "2026-09-05T20:00:00Z", "f1"),
    entry("exact_score", "2026-09-06T14:00:00Z", "f2"),
    entry("winner_and_margin", "2026-09-06T16:00:00Z", "f3"),
    entry("wrong", "2026-09-06T20:45:00Z", "f4"),
    entry("winner", "2026-09-07T14:00:00Z", "f5"),
    entry("winner", "2026-09-07T16:00:00Z", "f6"),
  ];
  const ordered = chronological(entries);
  const good = streakOf(ordered.map(isGood));
  const bad = streakOf(ordered.map((e) => !isGood(e)));

  assert.equal(good.current, 2);
  assert.equal(good.best, 3);
  assert.equal(bad.current, 0);
  assert.equal(bad.best, 1);
});

// --- playerStreaks / streaksBySeason -----------------------------------------

test("playerStreaks : les deux natures de serie en une passe", () => {
  const s = playerStreaks([
    entry("winner", "2026-09-05T20:00:00Z", "f1"),
    entry("wrong", "2026-09-06T14:00:00Z", "f2"),
    entry("wrong", "2026-09-06T16:00:00Z", "f3"),
    entry("exact_score", "2026-09-07T14:00:00Z", "f4"),
  ]);
  assert.equal(s.good.current, 1);
  assert.equal(s.good.best, 1);
  assert.equal(s.bad.current, 0);
  assert.equal(s.bad.best, 2);
});

test("playerStreaks : l'ordre d'entree n'a pas d'importance", () => {
  const chrono = [
    entry("winner", "2026-09-05T20:00:00Z", "f1"),
    entry("winner", "2026-09-06T14:00:00Z", "f2"),
    entry("wrong", "2026-09-07T14:00:00Z", "f3"),
  ];
  const shuffled = [chrono[2], chrono[0], chrono[1]];
  assert.deepEqual(playerStreaks(shuffled), playerStreaks(chrono));
});

test("streaksBySeason : une serie par joueur", () => {
  const entries = [
    entry("winner", "2026-09-05T20:00:00Z", "f1", { userId: "alice" }),
    entry("winner", "2026-09-06T14:00:00Z", "f2", { userId: "alice" }),
    entry("wrong", "2026-09-05T20:00:00Z", "f1", { userId: "bob" }),
  ];
  const map = streaksBySeason(entries, "official");
  assert.equal(map.get("alice")?.good.best, 2);
  assert.equal(map.get("bob")?.good.best, 0);
  assert.equal(map.get("bob")?.bad.best, 1);
});

test("streaksBySeason : la portee officielle ecarte les matchs non officiels", () => {
  const entries = [
    entry("winner", "2026-09-05T20:00:00Z", "f1", { fixtureStatus: "finished" }),
    entry("winner", "2026-09-06T14:00:00Z", "f2"),
  ];
  assert.equal(streaksBySeason(entries, "official").get("alice")?.good.best, 1);
  assert.equal(streaksBySeason(entries, "live").get("alice")?.good.best, 2);
});
