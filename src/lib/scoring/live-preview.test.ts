import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLivePreview, computeLivePreviewByUser } from "./live-preview.ts";
import type { MarginBucket, Prediction, Ruleset } from "../types.ts";

const buckets: MarginBucket[] = [
  { id: "b1", position: 1, minPoints: 0, maxPoints: 5, label: "0-5" },
  { id: "b2", position: 2, minPoints: 6, maxPoints: 10, label: "6-10" },
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
    id: "p", userId: "u1", fixtureId: "f",
    outcome: "home", marginBucketId: null, marginValue: null,
    exactHomeScore: null, exactAwayScore: null, isAuto: false,
    ...p,
  };
}

test("computeLivePreview note le pronostic sur le score EN DIRECT, pas l'officiel", () => {
  // Score en direct : 16-10 (le match n'est pas fini). Pronostic : score exact 16-10.
  const preview = computeLivePreview(
    pred({ exactHomeScore: 16, exactAwayScore: 10 }),
    { homeScore: 16, awayScore: 10 },
    ruleset,
  );
  assert.equal(preview.points, 10);
  assert.equal(preview.level, "exact_score");
  assert.equal(preview.isLivePreview, true);
});

test("computeLivePreview change si le score en direct progresse", () => {
  const predicted = pred({ outcome: "home", exactHomeScore: 20, exactAwayScore: 10 });

  // À la 30e minute : 10-3, toujours le bon vainqueur, écart 7 → tranche 6-10.
  const early = computeLivePreview(predicted, { homeScore: 10, awayScore: 3 }, ruleset);
  assert.equal(early.points, 3);
  assert.equal(early.level, "winner_and_margin");

  // À la 60e minute, l'adversaire revient et prend la tête : mauvais vainqueur.
  const later = computeLivePreview(predicted, { homeScore: 10, awayScore: 15 }, ruleset);
  assert.equal(later.points, 0);
  assert.equal(later.level, "wrong");
});

test("computeLivePreview n'écrit jamais rien : c'est un ScoreResult ordinaire, marqué", () => {
  const preview = computeLivePreview(pred({}), { homeScore: 0, awayScore: 0 }, ruleset);
  // Pas de champ mutable, pas d'ID de ligne : juste points/level/breakdown + le marqueur.
  assert.deepEqual(Object.keys(preview).sort(), ["breakdown", "isLivePreview", "level", "points"]);
});

test("computeLivePreviewByUser agrège plusieurs pronostics sur le même match", () => {
  const predictions: Prediction[] = [
    pred({ userId: "alice", outcome: "home", exactHomeScore: 20, exactAwayScore: 10 }),
    pred({ userId: "bob", outcome: "away" }),
    pred({ userId: "chloe", outcome: "home", marginBucketId: "b1" }),
  ];
  const byUser = computeLivePreviewByUser(predictions, { homeScore: 20, awayScore: 10 }, ruleset);

  assert.equal(byUser.size, 3);
  assert.equal(byUser.get("alice")?.points, 10); // score exact
  assert.equal(byUser.get("bob")?.points, 0); // mauvais vainqueur
  assert.equal(byUser.get("chloe")?.points, 1); // bon vainqueur, mais tranche 0-5 fausse (écart réel 10 → tranche 6-10)
});
