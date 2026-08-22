import { test } from "node:test";
import assert from "node:assert/strict";
import { computeScore, bucketFor, outcomeOf, marginOf } from "./index.ts";
import type { MarginBucket, Prediction, Ruleset } from "../types.ts";

const buckets: MarginBucket[] = [
  { id: "b1", position: 1, minPoints: 0, maxPoints: 5, label: "0-5" },
  { id: "b2", position: 2, minPoints: 6, maxPoints: 10, label: "6-10" },
  { id: "b3", position: 3, minPoints: 11, maxPoints: 15, label: "11-15" },
  { id: "b4", position: 4, minPoints: 16, maxPoints: 20, label: "16-20" },
  { id: "b9", position: 9, minPoints: 41, maxPoints: null, label: "41+" },
];

const ruleset: Ruleset = {
  id: "r1",
  version: 1,
  points: { wrong: 0, winner: 1, winner_and_margin: 3, exact_score: 10 },
  marginMode: "buckets",
  marginDistanceTolerance: 3,
  exactScore: { quota: 1, period: "round", imposedFixtureIds: [] },
  lock: { minutesBeforeKickoff: 120 },
  defaultPrediction: { enabled: true, outcome: "home", marginBucket: "median" },
  buckets,
};

function pred(p: Partial<Prediction>): Prediction {
  return {
    id: "p", userId: "u", fixtureId: "f",
    outcome: "home", marginBucketId: null, marginValue: null,
    exactHomeScore: null, exactAwayScore: null, isAuto: false,
    ...p,
  };
}

// --- Les quatre exemples du cahier des charges ------------------------------
// Pronostic : Clermont 16-10 (Clermont reçoit)

test("16-10 vs 20-14 → bon vainqueur, écart 6 dans la tranche 6-10 → 3 points", () => {
  const r = computeScore(
    pred({ outcome: "home", exactHomeScore: 16, exactAwayScore: 10 }),
    { homeScore: 20, awayScore: 14 }, ruleset);
  assert.equal(r.points, 3);
  assert.equal(r.level, "winner_and_margin");
  assert.equal(r.breakdown.marginDerivedFromExact, true);
});

test("16-10 vs 25-20 → écart réel 5 (tranche 0-5) ≠ 6-10 → 1 point", () => {
  const r = computeScore(
    pred({ outcome: "home", exactHomeScore: 16, exactAwayScore: 10 }),
    { homeScore: 25, awayScore: 20 }, ruleset);
  assert.equal(r.points, 1);
  assert.equal(r.level, "winner");
});

test("Clermont 16-10 vs Toulouse 20-10 → mauvais vainqueur → 0 point", () => {
  const r = computeScore(
    pred({ outcome: "home", exactHomeScore: 16, exactAwayScore: 10 }),
    { homeScore: 10, awayScore: 20 }, ruleset);
  assert.equal(r.points, 0);
  assert.equal(r.level, "wrong");
});

test("16-10 vs 16-10 → score exact → 10 points, pas 3", () => {
  const r = computeScore(
    pred({ outcome: "home", exactHomeScore: 16, exactAwayScore: 10 }),
    { homeScore: 16, awayScore: 10 }, ruleset);
  assert.equal(r.points, 10);
  assert.equal(r.level, "exact_score");
});

// --- La règle produit : le score exact ne pénalise jamais --------------------

test("tenter un score exact ne fait jamais perdre de points", () => {
  // Sur 400 résultats plausibles, le prono avec score exact rapporte
  // toujours au moins autant que le même prono sans score exact.
  for (let h = 0; h <= 40; h += 2) {
    for (let a = 0; a <= 40; a += 2) {
      const result = { homeScore: h, awayScore: a };
      const sans = computeScore(
        pred({ outcome: "home", marginBucketId: "b2" }), result, ruleset);
      const avec = computeScore(
        pred({ outcome: "home", marginBucketId: "b2", exactHomeScore: 16, exactAwayScore: 10 }),
        result, ruleset);
      assert.ok(avec.points >= sans.points,
        `régression sur ${h}-${a} : ${avec.points} < ${sans.points}`);
    }
  }
});

test("une tranche choisie juste l'emporte même si le score exact est faux", () => {
  // Tranche choisie 11-15, score exact annoncé 16-10 (écart 6), écart réel 12.
  const r = computeScore(
    pred({ outcome: "home", marginBucketId: "b3", exactHomeScore: 16, exactAwayScore: 10 }),
    { homeScore: 24, awayScore: 12 }, ruleset);
  assert.equal(r.points, 3);
  assert.equal(r.breakdown.marginDerivedFromExact, false);
});

// --- Match nul ---------------------------------------------------------------

test("un nul pronostiqué et obtenu vaut bon vainqueur + bon écart", () => {
  const r = computeScore(
    pred({ outcome: "draw", marginBucketId: "b1" }),
    { homeScore: 17, awayScore: 17 }, ruleset);
  assert.equal(r.points, 3);
  assert.equal(r.breakdown.actualMargin, 0);
});

test("un nul non prévu casse la cascade", () => {
  const r = computeScore(
    pred({ outcome: "home", marginBucketId: "b1" }),
    { homeScore: 17, awayScore: 17 }, ruleset);
  assert.equal(r.points, 0);
});

// --- Mode distance -----------------------------------------------------------

test("mode distance : écart annoncé 8, écart réel 10, tolérance 3 → 3 points", () => {
  const rs: Ruleset = { ...ruleset, marginMode: "distance" };
  const r = computeScore(
    pred({ outcome: "home", marginValue: 8 }),
    { homeScore: 30, awayScore: 20 }, rs);
  assert.equal(r.points, 3);
});

test("mode distance : écart annoncé 8, écart réel 20 → 1 point", () => {
  const rs: Ruleset = { ...ruleset, marginMode: "distance" };
  const r = computeScore(
    pred({ outcome: "home", marginValue: 8 }),
    { homeScore: 40, awayScore: 20 }, rs);
  assert.equal(r.points, 1);
});

// --- Utilitaires -------------------------------------------------------------

test("la tranche haute est ouverte", () => {
  assert.equal(bucketFor(60, buckets)?.label, "41+");
  assert.equal(bucketFor(0, buckets)?.label, "0-5");
});

test("outcomeOf et marginOf", () => {
  assert.equal(outcomeOf({ homeScore: 3, awayScore: 3 }), "draw");
  assert.equal(outcomeOf({ homeScore: 1, awayScore: 3 }), "away");
  assert.equal(marginOf({ homeScore: 10, awayScore: 24 }), 14);
});

// --- Rejouabilité ------------------------------------------------------------

test("le calcul est déterministe : 500 rejeux donnent le même résultat", () => {
  const p = pred({ outcome: "home", marginBucketId: "b2", exactHomeScore: 16, exactAwayScore: 10 });
  const first = JSON.stringify(computeScore(p, { homeScore: 20, awayScore: 14 }, ruleset));
  for (let i = 0; i < 500; i++) {
    assert.equal(JSON.stringify(computeScore(p, { homeScore: 20, awayScore: 14 }, ruleset)), first);
  }
});
