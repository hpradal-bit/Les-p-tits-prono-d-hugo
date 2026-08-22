import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketMidpoint,
  buildDefaultPrediction,
  consensusOutcome,
  medianBucket,
  resolveDefaultBucket,
  resolveDefaultOutcome,
} from "./defaults.ts";
import type { MarginBucket, Ruleset } from "../types.ts";

// Les neuf tranches du barème de départ.
const buckets: MarginBucket[] = [
  { id: "b1", position: 1, minPoints: 0, maxPoints: 5, label: "0-5" },
  { id: "b2", position: 2, minPoints: 6, maxPoints: 10, label: "6-10" },
  { id: "b3", position: 3, minPoints: 11, maxPoints: 15, label: "11-15" },
  { id: "b4", position: 4, minPoints: 16, maxPoints: 20, label: "16-20" },
  { id: "b5", position: 5, minPoints: 21, maxPoints: 25, label: "21-25" },
  { id: "b6", position: 6, minPoints: 26, maxPoints: 30, label: "26-30" },
  { id: "b7", position: 7, minPoints: 31, maxPoints: 35, label: "31-35" },
  { id: "b8", position: 8, minPoints: 36, maxPoints: 40, label: "36-40" },
  { id: "b9", position: 9, minPoints: 41, maxPoints: null, label: "41+" },
];

function makeRuleset(over: Partial<Ruleset> = {}): Ruleset {
  return {
    id: "r1",
    version: 1,
    points: { wrong: 0, winner: 1, winner_and_margin: 3, exact_score: 10 },
    marginMode: "buckets",
    marginDistanceTolerance: 3,
    exactScore: { quota: 1, period: "round", imposedFixtureIds: [] },
    lock: { minutesBeforeKickoff: 120 },
    defaultPrediction: { enabled: true, outcome: "home", marginBucket: "median" },
    buckets,
    ...over,
  };
}

test("la tranche médiane de neuf tranches est la cinquième", () => {
  assert.equal(medianBucket(buckets)?.label, "21-25");
  assert.equal(medianBucket([]), null);
});

test("la tranche médiane est stable même si les tranches arrivent en désordre", () => {
  const melange = [...buckets].reverse();
  assert.equal(medianBucket(melange)?.label, "21-25");
});

test("l'admin peut imposer une tranche précise, par identifiant ou par libellé", () => {
  assert.equal(
    resolveDefaultBucket(
      makeRuleset({ defaultPrediction: { enabled: true, outcome: "home", marginBucket: "b1" } }),
    )?.label,
    "0-5",
  );
  assert.equal(
    resolveDefaultBucket(
      makeRuleset({ defaultPrediction: { enabled: true, outcome: "home", marginBucket: "6-10" } }),
    )?.label,
    "6-10",
  );
});

test("une tranche introuvable retombe sur la médiane, jamais sur une erreur", () => {
  const rs = makeRuleset({
    defaultPrediction: { enabled: true, outcome: "home", marginBucket: "n'existe-pas" },
  });
  assert.equal(resolveDefaultBucket(rs)?.label, "21-25");
});

test("l'issue par défaut « home » est le domicile", () => {
  assert.equal(resolveDefaultOutcome(makeRuleset()), "home");
});

test("« last_choice » reprend la dernière issue jouée, à défaut le domicile", () => {
  const rs = makeRuleset({
    defaultPrediction: { enabled: true, outcome: "last_choice", marginBucket: "median" },
  });
  assert.equal(resolveDefaultOutcome(rs, { lastChoice: "away" }), "away");
  assert.equal(resolveDefaultOutcome(rs, { lastChoice: null }), "home");
  assert.equal(resolveDefaultOutcome(rs, {}), "home");
});

test("« median » suit le consensus du groupe, à défaut le domicile", () => {
  const rs = makeRuleset({
    defaultPrediction: { enabled: true, outcome: "median", marginBucket: "median" },
  });
  assert.equal(resolveDefaultOutcome(rs, { consensus: "away" }), "away");
  assert.equal(resolveDefaultOutcome(rs, { consensus: null }), "home");
});

test("le consensus est l'issue majoritaire, le domicile départage", () => {
  assert.equal(consensusOutcome(["away", "away", "home"]), "away");
  assert.equal(consensusOutcome(["home", "away"]), "home");
  assert.equal(consensusOutcome(["draw", "draw", "home"]), "draw");
  assert.equal(consensusOutcome([]), null);
});

test("le prono par défaut en mode tranches : issue + tranche, jamais de score exact", () => {
  const draft = buildDefaultPrediction(makeRuleset());
  assert.equal(draft.outcome, "home");
  assert.equal(draft.marginBucketId, "b5");
  assert.equal(draft.marginValue, null);
  assert.ok(!("exactHomeScore" in draft), "le prono par défaut ne dépense pas de quota");
});

test("le prono par défaut en mode distance annonce un écart chiffré", () => {
  const draft = buildDefaultPrediction(makeRuleset({ marginMode: "distance" }));
  assert.equal(draft.marginBucketId, null);
  assert.equal(draft.marginValue, 23); // milieu de la tranche 21-25
});

test("le milieu d'une tranche ouverte est sa borne basse", () => {
  assert.equal(bucketMidpoint(buckets[8]), 41);
  assert.equal(bucketMidpoint(buckets[0]), 3);
});

test("le prono par défaut est déterministe : mêmes entrées, même sortie", () => {
  const rs = makeRuleset({
    defaultPrediction: { enabled: true, outcome: "median", marginBucket: "median" },
  });
  const ctx = { consensus: "away" as const, lastChoice: "home" as const };
  const first = JSON.stringify(buildDefaultPrediction(rs, ctx));
  for (let i = 0; i < 100; i += 1) {
    assert.equal(JSON.stringify(buildDefaultPrediction(rs, ctx)), first);
  }
});
