import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeDuelBattle } from "./battle.ts";
import { duel } from "./kinds/duel.ts";
import type { PowerUsage, Power, ResolveContext } from "./types.ts";

describe("computeDuelBattle", () => {
  test("sans match en direct : les totaux officiels decident, le reste est a jouer", () => {
    const battle = computeDuelBattle({
      initiatorId: "hugo",
      targetId: "pierre",
      fixtures: [
        { id: "f1", status: "official" },
        { id: "f2", status: "official" },
        { id: "f3", status: "scheduled" },
      ],
      officialPoints: new Map([["hugo", 15], ["pierre", 10]]),
      liveContributions: [],
    });

    assert.equal(battle.initiatorPoints, 15);
    assert.equal(battle.targetPoints, 10);
    assert.equal(battle.totalFixtures, 3);
    assert.equal(battle.playedFixtures, 2);
    assert.equal(battle.remainingFixtures, 1);
    assert.equal(battle.tie, false);
    assert.equal(battle.leaderId, "hugo");
  });

  test("un match en direct ajoute son apercu par-dessus les totaux officiels", () => {
    const battle = computeDuelBattle({
      initiatorId: "hugo",
      targetId: "pierre",
      fixtures: [
        { id: "f1", status: "official" },
        { id: "f2", status: "live" },
      ],
      officialPoints: new Map([["hugo", 5], ["pierre", 5]]),
      liveContributions: [
        { userId: "hugo", fixtureId: "f2", points: 3 },
        { userId: "pierre", fixtureId: "f2", points: 0 },
        // Un tiers quelconque (pas une partie du Duel) ne doit jamais compter.
        { userId: "marco", fixtureId: "f2", points: 10 },
      ],
    });

    assert.equal(battle.initiatorPoints, 8);
    assert.equal(battle.targetPoints, 5);
    assert.equal(battle.remainingFixtures, 1);
    assert.equal(battle.leaderId, "hugo");
  });

  test("egalite -> aucun meneur", () => {
    const battle = computeDuelBattle({
      initiatorId: "hugo",
      targetId: "pierre",
      fixtures: [{ id: "f1", status: "official" }],
      officialPoints: new Map([["hugo", 7], ["pierre", 7]]),
      liveContributions: [],
    });
    assert.equal(battle.tie, true);
    assert.equal(battle.leaderId, null);
  });

  test("aucun match -> zero partout, rien a jouer", () => {
    const battle = computeDuelBattle({
      initiatorId: "hugo",
      targetId: "pierre",
      fixtures: [],
      officialPoints: new Map(),
      liveContributions: [],
    });
    assert.equal(battle.initiatorPoints, 0);
    assert.equal(battle.targetPoints, 0);
    assert.equal(battle.totalFixtures, 0);
    assert.equal(battle.remainingFixtures, 0);
    assert.equal(battle.tie, true);
  });

  test("une fois tous les matchs officiels, retombe exactement sur duel.resolve (meme calcul de resolution)", () => {
    const officialPoints = new Map([["hugo", 22], ["pierre", 19]]);
    const fixtures = [
      { id: "f1", status: "official" as const },
      { id: "f2", status: "official" as const },
    ];

    const battle = computeDuelBattle({
      initiatorId: "hugo",
      targetId: "pierre",
      fixtures,
      officialPoints,
      liveContributions: [],
    });

    // Le calcul que ferait reellement `resolve.ts` a la cloture, avec les
    // memes totaux officiels (`loadRoundTotals`) — c'est la verite que la
    // vue en direct doit annoncer d'avance, jamais une approximation.
    const usage: PowerUsage = {
      id: "usage-1",
      tokenId: "",
      powerId: "power-duel",
      powerCode: "duel",
      initiatorId: "hugo",
      targetId: "pierre",
      roundId: "round-1",
      state: "declared",
      snapshotBefore: {},
      result: null,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    const power: Power = {
      id: "power-duel",
      code: "duel",
      name: "Duel",
      emoji: "⚔️",
      description: null,
      config: {},
      isActive: true,
    };
    const ctx: ResolveContext = {
      usage,
      power,
      fixtureScores: new Map(),
      roundTotals: officialPoints,
    };
    const result = duel.resolve(ctx);
    const outcome = result.outcome as { winnerId?: string; winner?: null };

    assert.equal(battle.remainingFixtures, 0);
    if (outcome.winnerId) {
      assert.equal(battle.leaderId, outcome.winnerId);
    } else {
      assert.equal(battle.tie, true);
    }
  });
});
