import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFixtureBreakdown,
  predictionLabel,
  powerSentence,
  type RawPrediction,
  type RawPowerUse,
} from "./breakdowns.ts";

const TEAMS = { home: "Toulouse", away: "Bayonne" };
const NAMES = new Map([
  ["u1", "Hugo"],
  ["u2", "Pierre"],
  ["u3", "Marc"],
]);
const BUCKETS = new Map([["b1", "1-7"]]);

function prediction(over: Partial<RawPrediction> = {}): RawPrediction {
  return {
    fixtureId: "f1",
    userId: "u1",
    outcome: "home",
    marginBucketId: null,
    exactHomeScore: null,
    exactAwayScore: null,
    isAuto: false,
    points: 1,
    level: "winner",
    ...over,
  };
}

test("le libellé dit le camp, le score exact ou la tranche", () => {
  assert.equal(predictionLabel(prediction(), TEAMS, BUCKETS), "Toulouse");
  assert.equal(
    predictionLabel(prediction({ exactHomeScore: 24, exactAwayScore: 20 }), TEAMS, BUCKETS),
    "Toulouse · 24–20",
  );
  assert.equal(
    predictionLabel(prediction({ marginBucketId: "b1" }), TEAMS, BUCKETS),
    "Toulouse · écart 1-7",
  );
  assert.equal(predictionLabel(prediction({ outcome: "draw" }), TEAMS, BUCKETS), "Nul");
  assert.equal(predictionLabel(prediction({ outcome: "away" }), TEAMS, BUCKETS), "Bayonne");
});

test("ne garde que les pronostics du match demandé", () => {
  const b = buildFixtureBreakdown(
    "f1",
    [prediction(), prediction({ fixtureId: "f2", userId: "u2" })],
    [],
    NAMES,
    TEAMS,
    BUCKETS,
  );
  assert.deepEqual(b.players.map((p) => p.firstName), ["Hugo"]);
});

test("le meilleur en haut, les non-notés en bas", () => {
  const b = buildFixtureBreakdown(
    "f1",
    [
      prediction({ userId: "u1", points: 1 }),
      prediction({ userId: "u2", points: 10 }),
      prediction({ userId: "u3", points: null, level: null }),
    ],
    [],
    NAMES,
    TEAMS,
    BUCKETS,
  );
  assert.deepEqual(b.players.map((p) => p.firstName), ["Pierre", "Hugo", "Marc"]);
});

test("un pouvoir raconte qui, sur qui, et ce qu'il a déplacé", () => {
  const use: RawPowerUse = {
    usageId: "p1",
    fixtureId: "f1",
    actorId: "u3",
    targetId: "u2",
    emoji: "🎯",
    powerName: "Sabotage",
    deltaByUser: new Map([
      ["u3", 1],
      ["u2", -3],
    ]),
  };
  const b = buildFixtureBreakdown("f1", [], [use], NAMES, TEAMS, BUCKETS);
  assert.equal(b.powers.length, 1);
  assert.equal(b.powers[0].actorName, "Marc");
  assert.equal(b.powers[0].targetName, "Pierre");
  assert.equal(b.powers[0].actorDelta, 1);
  assert.equal(b.powers[0].targetDelta, -3);
  assert.equal(powerSentence(b.powers[0]), "Sabotage · Marc sur Pierre · +1 · Pierre -3");
});

test("un pouvoir sans cible et sans effet reste lisible", () => {
  const b = buildFixtureBreakdown(
    "f1",
    [],
    [
      {
        usageId: "p2",
        fixtureId: "f1",
        actorId: "u1",
        targetId: null,
        emoji: "🔮",
        powerName: "Oracle",
        deltaByUser: new Map(),
      },
    ],
    NAMES,
    TEAMS,
    BUCKETS,
  );
  assert.equal(b.powers[0].actorDelta, 0);
  assert.equal(b.powers[0].targetDelta, null);
  assert.equal(powerSentence(b.powers[0]), "Oracle · Hugo · +0");
});

test("les pouvoirs posés sur un autre match sont ignorés", () => {
  const b = buildFixtureBreakdown(
    "f1",
    [],
    [
      {
        usageId: "p3",
        fixtureId: "f2",
        actorId: "u1",
        targetId: null,
        emoji: "🔮",
        powerName: "Oracle",
        deltaByUser: new Map(),
      },
    ],
    NAMES,
    TEAMS,
    BUCKETS,
  );
  assert.deepEqual(b.powers, []);
});

test("un joueur inconnu ne fait pas tomber l'écran", () => {
  const b = buildFixtureBreakdown(
    "f1",
    [prediction({ userId: "inconnu" })],
    [],
    NAMES,
    TEAMS,
    BUCKETS,
  );
  assert.equal(b.players[0].firstName, "Joueur");
});
