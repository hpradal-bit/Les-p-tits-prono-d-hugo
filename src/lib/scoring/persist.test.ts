import { test } from "node:test";
import assert from "node:assert/strict";
import { planFixtureScores } from "./persist.ts";
import type { MarginBucket, Prediction, Ruleset } from "../types.ts";

const buckets: MarginBucket[] = [
  { id: "b1", position: 1, minPoints: 0, maxPoints: 5, label: "0-5" },
  { id: "b2", position: 2, minPoints: 6, maxPoints: 10, label: "6-10" },
  { id: "b3", position: 3, minPoints: 11, maxPoints: 15, label: "11-15" },
];

const ruleset: Ruleset = {
  id: "rs-1", version: 1,
  points: { wrong: 0, winner: 1, winner_and_margin: 3, exact_score: 10 },
  marginMode: "buckets", marginDistanceTolerance: 3,
  exactScore: { quota: 1, period: "round", imposedFixtureIds: [] },
  lock: { minutesBeforeKickoff: 120 },
  defaultPrediction: { enabled: true, outcome: "home", marginBucket: "median" },
  buckets,
};

function pred(id: string, userId: string, p: Partial<Prediction> = {}): Prediction {
  return {
    id, userId, fixtureId: "f1", outcome: "home",
    marginBucketId: null, marginValue: null,
    exactHomeScore: null, exactAwayScore: null, isAuto: false,
    ...p,
  };
}

// Clermont 24 – 12 : écart 12, tranche 11-15
const result = { homeScore: 24, awayScore: 12 };

test("chaque pronostic reçoit sa ligne de points", () => {
  const plan = planFixtureScores(
    [
      pred("p1", "hugo", { outcome: "home", marginBucketId: "b3" }),          // 3
      pred("p2", "marco", { outcome: "home", marginBucketId: "b1" }),         // 1
      pred("p3", "pierre", { outcome: "away", marginBucketId: "b3" }),        // 0
      pred("p4", "antoine", { exactHomeScore: 24, exactAwayScore: 12 }),      // 10
    ],
    result, ruleset, true,
  );

  assert.equal(plan.rows.length, 4);
  assert.deepEqual(plan.rows.map((r) => r.points), [3, 1, 0, 10]);
  assert.equal(plan.totalPoints, 14);
  assert.deepEqual(plan.exactScorers, ["antoine"]);
});

test("le détail enregistré explique les points", () => {
  const plan = planFixtureScores(
    [pred("p1", "hugo", { marginBucketId: "b3" })], result, ruleset, false,
  );
  const b = plan.rows[0].breakdown as Record<string, unknown>;
  assert.equal(b.level, "winner_and_margin");
  assert.equal(b.outcomeCorrect, true);
  assert.equal(b.marginCorrect, true);
  assert.equal(b.actualMargin, 12);
  assert.equal(b.actualBucketLabel, "11-15");
});

test("le caractère officiel du résultat est reporté sur chaque ligne", () => {
  const live = planFixtureScores([pred("p1", "hugo")], result, ruleset, false);
  const off = planFixtureScores([pred("p1", "hugo")], result, ruleset, true);
  assert.equal(live.rows[0].is_official, false);
  assert.equal(off.rows[0].is_official, true);
});

test("le barème utilisé est tracé sur chaque ligne", () => {
  const plan = planFixtureScores([pred("p1", "hugo")], result, ruleset, true);
  assert.equal(plan.rows[0].ruleset_id, "rs-1");
});

test("un match sans pronostic ne produit rien", () => {
  const plan = planFixtureScores([], result, ruleset, true);
  assert.deepEqual(plan.rows, []);
  assert.equal(plan.totalPoints, 0);
});

test("rejouer le calcul redonne exactement le même résultat", () => {
  const predictions = [
    pred("p1", "hugo", { marginBucketId: "b3" }),
    pred("p2", "marco", { exactHomeScore: 24, exactAwayScore: 12 }),
    pred("p3", "pierre", { outcome: "draw" }),
  ];
  const first = JSON.stringify(planFixtureScores(predictions, result, ruleset, true));
  for (let i = 0; i < 100; i++) {
    assert.equal(JSON.stringify(planFixtureScores(predictions, result, ruleset, true)), first);
  }
});

test("corriger un score change les points, sans effet de bord", () => {
  const predictions = [pred("p1", "hugo", { marginBucketId: "b3" })];
  // Résultat saisi par erreur : 24-20 (écart 4, tranche 0-5) → 1 point
  const faux = planFixtureScores(predictions, { homeScore: 24, awayScore: 20 }, ruleset, true);
  assert.equal(faux.rows[0].points, 1);
  // Corrigé en 24-12 (écart 12, tranche 11-15) → 3 points
  const vrai = planFixtureScores(predictions, result, ruleset, true);
  assert.equal(vrai.rows[0].points, 3);
  // Et le recalcul ne dépend que des entrées : même identifiant de ligne
  assert.equal(faux.rows[0].prediction_id, vrai.rows[0].prediction_id);
});

test("un pronostic automatique est scoré comme les autres", () => {
  const plan = planFixtureScores(
    [pred("p1", "absent", { marginBucketId: "b3", isAuto: true })], result, ruleset, true,
  );
  assert.equal(plan.rows[0].points, 3);
});
