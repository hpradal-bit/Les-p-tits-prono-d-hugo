import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFixtureBreakdown,
  predictionLabel,
  powerSentence,
  netPoints,
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
  // u2 a bien parié, mais sur l'AUTRE match : sur f1, il n'a rien joué, comme
  // u3 — les deux apparaissent donc « Non parié », pas absents.
  assert.deepEqual(
    b.players.map((p) => [p.name, p.missing]),
    [["Hugo", false], ["Marc", true], ["Pierre", true]],
  );
});

test("un joueur qui n'a rien pronostiqué reste visible, à zéro", () => {
  const b = buildFixtureBreakdown(
    "f1",
    [prediction({ userId: "u1" })],
    [],
    NAMES,
    TEAMS,
    BUCKETS,
  );
  const marc = b.players.find((p) => p.name === "Marc")!;
  assert.equal(marc.missing, true);
  assert.equal(marc.label, "Non parié");
  assert.equal(marc.points, 0);
  assert.equal(marc.level, null);
  assert.equal(marc.isAuto, false);
});

test("tout le monde a parié : personne n'est marqué manquant", () => {
  const b = buildFixtureBreakdown(
    "f1",
    [
      prediction({ userId: "u1" }),
      prediction({ userId: "u2" }),
      prediction({ userId: "u3" }),
    ],
    [],
    NAMES,
    TEAMS,
    BUCKETS,
  );
  assert.deepEqual(b.players.map((p) => p.missing), [false, false, false]);
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
  assert.deepEqual(b.players.map((p) => p.name), ["Pierre", "Hugo", "Marc"]);
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
  assert.equal(powerSentence(b.powers[0]), "Oracle · Hugo");
});

test("un sabotage ne fait pas croire à un gain nul pour son auteur", () => {
  const b = buildFixtureBreakdown(
    "f1",
    [],
    [
      {
        usageId: "p4",
        fixtureId: "f1",
        actorId: "u1",
        targetId: "u2",
        emoji: "🎯",
        powerName: "Sabotage",
        deltaByUser: new Map([["u2", -3]]),
      },
    ],
    NAMES,
    TEAMS,
    BUCKETS,
  );
  assert.equal(b.powers[0].actorDelta, 0);
  assert.equal(powerSentence(b.powers[0]), "Sabotage · Hugo sur Pierre · Pierre -3");
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

test("un Sabotage reçu se lit sur la ligne du joueur : le brut ne bouge pas, le net oui", () => {
  // Marc (u3) a gagné 1 point sur ce match, mais s'est fait saboter -1 :
  // son point brut (ce qu'il a pronostiqué) reste 1, son point net tombe à 0.
  const use: RawPowerUse = {
    usageId: "p5",
    fixtureId: "f1",
    actorId: "u1",
    targetId: "u3",
    emoji: "💣",
    powerName: "Sabotage",
    deltaByUser: new Map([["u3", -1]]),
  };
  const b = buildFixtureBreakdown(
    "f1",
    [prediction({ userId: "u3", points: 1, level: "winner" })],
    [use],
    NAMES,
    TEAMS,
    BUCKETS,
  );
  const marc = b.players.find((p) => p.name === "Marc")!;
  assert.equal(marc.points, 1);
  assert.equal(marc.pointAdjustment, -1);
  assert.equal(netPoints(marc), 0);
});

test("sans pouvoir sur ce match, le net vaut le brut", () => {
  const b = buildFixtureBreakdown("f1", [prediction({ userId: "u1", points: 10 })], [], NAMES, TEAMS, BUCKETS);
  const hugo = b.players.find((p) => p.name === "Hugo")!;
  assert.equal(hugo.pointAdjustment, 0);
  assert.equal(netPoints(hugo), 10);
});

test("un pronostic hors ligue (compte de test) disparaît plutôt que de s'afficher sous un nom générique", () => {
  // `names` porte le trousseau de LA ligue : un pronostic dont l'auteur n'y
  // figure pas (compte de test resté actif hors de toute ligue, par exemple)
  // n'a rien à faire à l'écran — ni sous son vrai nom, ni sous un nom générique.
  const b = buildFixtureBreakdown(
    "f1",
    [prediction({ userId: "inconnu" }), prediction({ userId: "u1" })],
    [],
    NAMES,
    TEAMS,
    BUCKETS,
  );
  assert.equal(
    b.players.some((p) => p.userId === "inconnu"),
    false,
  );
  assert.equal(b.players.some((p) => p.userId === "u1"), true);
});
