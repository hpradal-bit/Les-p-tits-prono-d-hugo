import { test } from "node:test";
import assert from "node:assert/strict";

// `streaks.ts` utilise `@/lib/standings/engine` (alias Next.js), ce qui ne
// fonctionne pas directement avec `node --test`. On re-importe les fonctions
// pures qui n'ont pas de dependance `@/` via un chemin relatif sur le source.
// `streakOf` n'a besoin que de `boolean[]`, c'est le coeur du calcul.

// Import direct impossible a cause de l'alias @/ — on duplique le minimum.
// Les deux fonctions ci-dessous sont des copies exactes du fichier source ;
// elles sont testees ici pour valider la logique sans toucher au cablage.

type ScoreLevel = "wrong" | "winner" | "winner_and_margin" | "exact_score";

interface MinimalEntry {
  fixtureId: string;
  kickoffAt: string;
  level: ScoreLevel;
}

function isGood(entry: MinimalEntry): boolean {
  return entry.level !== "wrong";
}

function chronological<T extends { kickoffAt: string; fixtureId: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.kickoffAt !== b.kickoffAt) return a.kickoffAt < b.kickoffAt ? -1 : 1;
    return a.fixtureId < b.fixtureId ? -1 : a.fixtureId > b.fixtureId ? 1 : 0;
  });
}

function streakOf(flags: boolean[]): { current: number; best: number } {
  let best = 0;
  let run = 0;
  for (const flag of flags) {
    run = flag ? run + 1 : 0;
    if (run > best) best = run;
  }
  let current = 0;
  for (let i = flags.length - 1; i >= 0 && flags[i]; i -= 1) current += 1;
  return { current, best };
}

function entry(level: ScoreLevel, kickoffAt = "2026-09-05T20:00:00Z", fixtureId = "f1"): MinimalEntry {
  return { fixtureId, kickoffAt, level };
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
