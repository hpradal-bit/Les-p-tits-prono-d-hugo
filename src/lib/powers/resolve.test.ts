import { describe, it, expect } from "vitest";
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
    expect(res.adjustments).toHaveLength(1);
    expect(res.adjustments[0].userId).toBe("alice");
    expect(res.adjustments[0].delta).toBe(3);
    expect(res.outcome.bonus).toBe(3);
  });

  it("0 pts sur le match = pas d'ajustement", () => {
    const ctx: ResolveContext = {
      usage: makeUsage({ snapshotBefore: { fixtureId: "fix-1" } }),
      power: makePower("joker", { multiplier: 2 }),
      fixtureScores: new Map([["fix-1", new Map([["alice", 0]])]]),
      roundTotals: new Map([["alice", 4]]),
    };
    const res = joker.resolve(ctx);
    expect(res.adjustments).toHaveLength(0);
    expect(res.outcome.bonus).toBe(0);
  });

  it("utilise le multiplicateur de la config", () => {
    const ctx: ResolveContext = {
      usage: makeUsage({ snapshotBefore: { fixtureId: "fix-1" } }),
      power: makePower("joker", { multiplier: 3 }),
      fixtureScores: new Map([["fix-1", new Map([["alice", 10]])]]),
      roundTotals: new Map([["alice", 10]]),
    };
    const res = joker.resolve(ctx);
    expect(res.adjustments[0].delta).toBe(20);
  });

  it("valide la déclaration — fixture requise", () => {
    const r1 = joker.validateDeclaration({
      initiatorId: "a", targetId: null, fixtureId: null,
      power: makePower("joker"), standings: [],
    });
    expect(r1.valid).toBe(false);

    const r2 = joker.validateDeclaration({
      initiatorId: "a", targetId: null, fixtureId: "fix-1",
      power: makePower("joker"), standings: [],
    });
    expect(r2.valid).toBe(true);
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
    expect(res.adjustments).toHaveLength(2);
    expect(res.adjustments.find((a) => a.userId === "alice")?.delta).toBe(8);
    expect(res.adjustments.find((a) => a.userId === "bob")?.delta).toBe(-8);
    expect(res.outcome.winnerId).toBe("alice");
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
    expect(res.adjustments.find((a) => a.userId === "bob")?.delta).toBe(5);
    expect(res.adjustments.find((a) => a.userId === "alice")?.delta).toBe(-5);
    expect(res.outcome.winnerId).toBe("bob");
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
    expect(res.adjustments).toHaveLength(0);
    expect(res.outcome.winner).toBeNull();
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
    expect(ok.valid).toBe(true);

    const bad = duel.validateDeclaration({
      initiatorId: "bob", targetId: "alice", fixtureId: null, power, standings,
    });
    expect(bad.valid).toBe(false);
  });

  it("refuse de se défier soi-même", () => {
    const r = duel.validateDeclaration({
      initiatorId: "alice", targetId: "alice", fixtureId: null,
      power: makePower("duel"), standings: [],
    });
    expect(r.valid).toBe(false);
  });
});
