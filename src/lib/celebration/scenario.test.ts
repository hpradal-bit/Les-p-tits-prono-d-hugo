import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { pickScenario, isCelebrationWindowOpen } from "./scenario.ts";

describe("pickScenario", () => {
  test("1er l'emporte sur tout le reste", () => {
    assert.equal(pickScenario({ position: 1, movement: -5, exactScoreCount: 0 }, 6), "first");
  });

  test("dernier, avec assez de joueurs pour que ça compte", () => {
    assert.equal(pickScenario({ position: 6, movement: 0, exactScoreCount: 0 }, 6), "last");
  });

  test("dernier ne se déclenche pas dans un groupe trop petit", () => {
    assert.equal(pickScenario({ position: 2, movement: 0, exactScoreCount: 0 }, 2), "second");
  });

  test("2e et 3e", () => {
    assert.equal(pickScenario({ position: 2, movement: 0, exactScoreCount: 0 }, 6), "second");
    assert.equal(pickScenario({ position: 3, movement: 0, exactScoreCount: 0 }, 6), "third");
  });

  test("grosse remontée hors podium", () => {
    assert.equal(pickScenario({ position: 4, movement: 3, exactScoreCount: 0 }, 6), "big_climb");
  });

  test("plusieurs scores exacts, sans remontée notable", () => {
    assert.equal(pickScenario({ position: 4, movement: 1, exactScoreCount: 2 }, 6), "exact_scores");
  });

  test("grosse chute, en dernier recours", () => {
    assert.equal(pickScenario({ position: 4, movement: -3, exactScoreCount: 0 }, 6), "big_drop");
  });

  test("repli neutre sans rien de notable", () => {
    assert.equal(pickScenario({ position: 4, movement: 1, exactScoreCount: 0 }, 6), "default");
  });
});

describe("isCelebrationWindowOpen", () => {
  const tz = "Europe/Paris";

  test("fermée avant lundi 6h", () => {
    // Lundi 2026-09-07 à 05h00 UTC = 07h CEST -> déjà après 6h, donc on prend une heure sûrement avant.
    assert.equal(isCelebrationWindowOpen(new Date("2026-09-07T03:00:00Z"), tz), false);
  });

  test("ouverte lundi après 6h", () => {
    assert.equal(isCelebrationWindowOpen(new Date("2026-09-07T05:00:00Z"), tz), true);
  });

  test("ouverte en semaine", () => {
    assert.equal(isCelebrationWindowOpen(new Date("2026-09-10T12:00:00Z"), tz), true);
  });

  test("fermée le dimanche", () => {
    assert.equal(isCelebrationWindowOpen(new Date("2026-09-06T12:00:00Z"), tz), false);
  });
});
