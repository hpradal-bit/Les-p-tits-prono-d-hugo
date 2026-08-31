import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { joker } from "./kinds/joker.ts";
import { duel } from "./kinds/duel.ts";
import type { Power, PowerUsage, ResolveContext } from "./types.ts";

function makePower(code: string, config: Record<string, unknown> = {}): Power {
  return { id: "pow-1", code, name: code, emoji: "⚡", description: null, config, isActive: true };
}

function makeUsage(overrides: Partial<PowerUsage> = {}): PowerUsage {
  return {
    id: "u-1",
    tokenId: "t-1",
    powerId: "pow-1",
    powerCode: "joker",
    initiatorId: "alice",
    targetId: null,
    roundId: "r-1",
    state: "declared",
    snapshotBefore: {},
    result: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    ...overrides,
  };
}

describe("joker", () => {
  it("double les points du match choisi", () => {
    const ctx: ResolveContext = {
      usage: makeUsage({ snapshotBefore: { fixtureId: "fix-1" } }),
      power: makePower("joker", { multiplier: 2 }),
      fixtureScores: new Map([["fix-1", new Map([["alice", 3]])]]),
      roundTotals: new Map([["alice", 7]]),
    };
    const res = joker.resolve(ctx);
    assert.equal(res.adjustments.length, 1);
    assert.equal(res.adjustments[0].userId, "alice");
    assert.equal(res.adjustments[0].delta, 3);
    assert.equal(res.outcome.bonus, 3);
  });

  it("0 pts sur le match = pas d'ajustement", () => {
    const ctx: ResolveContext = {
      usage: makeUsage({ snapshotBefore: { fixtureId: "fix-1" } }),
      power: makePower("joker", { multiplier: 2 }),
      fixtureScores: new Map([["fix-1", new Map([["alice", 0]])]]),
      roundTotals: new Map([["alice", 4]]),
    };
    const res = joker.resolve(ctx);
    assert.equal(res.adjustments.length, 0);
    assert.equal(res.outcome.bonus, 0);
  });

  it("utilise le multiplicateur de la config", () => {
    const ctx: ResolveContext = {
      usage: makeUsage({ snapshotBefore: { fixtureId: "fix-1" } }),
      power: makePower("joker", { multiplier: 3 }),
      fixtureScores: new Map([["fix-1", new Map([["alice", 10]])]]),
      roundTotals: new Map([["alice", 10]]),
    };
    const res = joker.resolve(ctx);
    assert.equal(res.adjustments[0].delta, 20);
  });

  it("valide la déclaration — fixture requise", () => {
    const r1 = joker.validateDeclaration({
      initiatorId: "a", targetId: null, fixtureId: null,
      power: makePower("joker"), standings: [],
    });
    assert.equal(r1.valid, false);

    const r2 = joker.validateDeclaration({
      initiatorId: "a", targetId: null, fixtureId: "fix-1",
      power: makePower("joker"), standings: [],
    });
    assert.equal(r2.valid, true);
  });
});

describe("duel", () => {
  it("l'initiateur gagne → transfert des points du perdant", () => {
    const ctx: ResolveContext = {
      usage: makeUsage({
        powerCode: "duel",
        initiatorId: "alice",
        targetId: "bob",
      }),
      power: makePower("duel", { target_rule: "better_ranked_only", tie: "no_transfer" }),
      fixtureScores: new Map(),
      roundTotals: new Map([["alice", 12], ["bob", 8]]),
    };
    const res = duel.resolve(ctx);
    assert.equal(res.adjustments.length, 2);
    assert.equal(res.adjustments.find((a) => a.userId === "alice")?.delta, 8);
    assert.equal(res.adjustments.find((a) => a.userId === "bob")?.delta, -8);
    assert.equal(res.outcome.winnerId, "alice");
  });

  it("la cible gagne → transfert inversé", () => {
    const ctx: ResolveContext = {
      usage: makeUsage({
        powerCode: "duel",
        initiatorId: "alice",
        targetId: "bob",
      }),
      power: makePower("duel", { tie: "no_transfer" }),
      fixtureScores: new Map(),
      roundTotals: new Map([["alice", 5], ["bob", 9]]),
    };
    const res = duel.resolve(ctx);
    assert.equal(res.adjustments.find((a) => a.userId === "bob")?.delta, 5);
    assert.equal(res.adjustments.find((a) => a.userId === "alice")?.delta, -5);
    assert.equal(res.outcome.winnerId, "bob");
  });

  it("égalité → aucun transfert", () => {
    const ctx: ResolveContext = {
      usage: makeUsage({
        powerCode: "duel",
        initiatorId: "alice",
        targetId: "bob",
      }),
      power: makePower("duel", { tie: "no_transfer" }),
      fixtureScores: new Map(),
      roundTotals: new Map([["alice", 7], ["bob", 7]]),
    };
    const res = duel.resolve(ctx);
    assert.equal(res.adjustments.length, 0);
    assert.equal(res.outcome.winner, null);
  });

  it("valide la cible — doit être mieux classée", () => {
    const standings = [
      { userId: "bob", position: 1 },
      { userId: "alice", position: 3 },
    ];
    const power = makePower("duel", { target_rule: "better_ranked_only" });

    const ok = duel.validateDeclaration({
      initiatorId: "alice", targetId: "bob", fixtureId: null, power, standings,
    });
    assert.equal(ok.valid, true);

    const bad = duel.validateDeclaration({
      initiatorId: "bob", targetId: "alice", fixtureId: null, power, standings,
    });
    assert.equal(bad.valid, false);
  });

  it("refuse de se défier soi-même", () => {
    const r = duel.validateDeclaration({
      initiatorId: "alice", targetId: "alice", fixtureId: null,
      power: makePower("duel"), standings: [],
    });
    assert.equal(r.valid, false);
  });

  it("accepte n'importe quelle cible quand target_rule vaut \"any\"", () => {
    const standings = [
      { userId: "alice", position: 1 },
      { userId: "bob", position: 2 },
    ];
    const power = makePower("duel", { target_rule: "any" });

    const r = duel.validateDeclaration({
      initiatorId: "alice", targetId: "bob", fixtureId: null, power, standings,
    });
    assert.equal(r.valid, true);
  });

  it("\"better_or_equal_ranked\" accepte mieux classé et à égalité, refuse moins bien classé", () => {
    // Décision finale d'Hugo (migration 0040, après un aller-retour) : mieux
    // classé OU à égalité de points, jamais moins bien classé.
    const standings = [
      { userId: "bob", position: 1 },
      { userId: "alice", position: 2 },
      { userId: "chloe", position: 2 }, // à égalité de points avec alice
      { userId: "denis", position: 4 },
    ];
    const power = makePower("duel", { target_rule: "better_or_equal_ranked" });

    const betterRanked = duel.validateDeclaration({
      initiatorId: "alice", targetId: "bob", fixtureId: null, power, standings,
    });
    assert.equal(betterRanked.valid, true);

    const tied = duel.validateDeclaration({
      initiatorId: "alice", targetId: "chloe", fixtureId: null, power, standings,
    });
    assert.equal(tied.valid, true);

    const worseRanked = duel.validateDeclaration({
      initiatorId: "alice", targetId: "denis", fixtureId: null, power, standings,
    });
    assert.equal(worseRanked.valid, false);
  });
});
