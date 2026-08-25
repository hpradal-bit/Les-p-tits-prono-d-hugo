import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spy } from "./kinds/spy.ts";
import { mirror } from "./kinds/mirror.ts";
import { sabotage } from "./kinds/sabotage.ts";
import { getPower } from "./registry.ts";
import { creditCost, powerEffect, powerRules, FALLBACK_CREDIT_COST } from "./credits.ts";
import type { Power, PowerUsage, ResolveContext } from "./types.ts";

function makePower(code: string, config: Record<string, unknown> = {}): Power {
  return { id: "pow-1", code, name: code, emoji: "⚡", description: null, config, isActive: true };
}

function makeUsage(overrides: Partial<PowerUsage> = {}): PowerUsage {
  return {
    id: "u-1",
    tokenId: "t-1",
    powerId: "pow-1",
    powerCode: "spy",
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

/**
 * Les codes du registre doivent correspondre exactement à ceux de la table
 * `powers`. Une divergence ferait échouer la résolution à la clôture — c'est
 * précisément le genre de panne silencieuse que ce test existe pour attraper.
 */
describe("registre des pouvoirs", () => {
  it("connaît les cinq codes présents en base", () => {
    for (const code of ["joker", "duel", "spy", "oracle", "sabotage"]) {
      assert.ok(getPower(code), `code absent du registre : ${code}`);
    }
  });

  it("expose l'Oracle sous le code oracle, pas mirror", () => {
    assert.equal(mirror.code, "oracle");
    assert.equal(getPower("mirror"), undefined);
  });
});

describe("espion", () => {
  it("révèle sans déplacer aucun point", () => {
    const ctx: ResolveContext = {
      usage: makeUsage({ targetId: "bob", snapshotBefore: { fixtureId: "fix-1" } }),
      power: makePower("spy"),
      fixtureScores: new Map([["fix-1", new Map([["bob", 7]])]]),
      roundTotals: new Map([["alice", 4], ["bob", 7]]),
    };
    const res = spy.resolve(ctx);
    assert.equal(res.adjustments.length, 0);
    assert.equal(res.outcome.revealed, true);
    assert.equal(res.outcome.targetId, "bob");
    assert.equal(res.outcome.fixtureId, "fix-1");
  });

  it("refuse de s'espionner soi-même", () => {
    const r = spy.validateDeclaration({
      initiatorId: "alice", targetId: "alice", fixtureId: "fix-1",
      power: makePower("spy"), standings: [],
    });
    assert.equal(r.valid, false);
  });

  it("exige une cible et un match", () => {
    const sansCible = spy.validateDeclaration({
      initiatorId: "alice", targetId: null, fixtureId: "fix-1",
      power: makePower("spy"), standings: [],
    });
    assert.equal(sansCible.valid, false);

    const sansMatch = spy.validateDeclaration({
      initiatorId: "alice", targetId: "bob", fixtureId: null,
      power: makePower("spy"), standings: [],
    });
    assert.equal(sansMatch.valid, false);
  });
});

describe("oracle", () => {
  it("ajoute le bonus quand le match a rapporté des points", () => {
    const ctx: ResolveContext = {
      usage: makeUsage({ powerCode: "oracle", snapshotBefore: { fixtureId: "fix-1" } }),
      power: makePower("oracle", { bonus: 2 }),
      fixtureScores: new Map([["fix-1", new Map([["alice", 3]])]]),
      roundTotals: new Map([["alice", 3]]),
    };
    const res = mirror.resolve(ctx);
    assert.equal(res.adjustments.length, 1);
    assert.equal(res.adjustments[0].userId, "alice");
    assert.equal(res.adjustments[0].delta, 2);
    assert.equal(res.outcome.bonus, 2);
  });

  it("ne donne rien sur un match à zéro point", () => {
    const ctx: ResolveContext = {
      usage: makeUsage({ powerCode: "oracle", snapshotBefore: { fixtureId: "fix-1" } }),
      power: makePower("oracle", { bonus: 2 }),
      fixtureScores: new Map([["fix-1", new Map([["alice", 0]])]]),
      roundTotals: new Map([["alice", 0]]),
    };
    const res = mirror.resolve(ctx);
    assert.equal(res.adjustments.length, 0);
    assert.equal(res.outcome.bonus, 0);
  });

  it("respecte le bonus de la config", () => {
    const ctx: ResolveContext = {
      usage: makeUsage({ powerCode: "oracle", snapshotBefore: { fixtureId: "fix-1" } }),
      power: makePower("oracle", { bonus: 5 }),
      fixtureScores: new Map([["fix-1", new Map([["alice", 1]])]]),
      roundTotals: new Map([["alice", 1]]),
    };
    assert.equal(mirror.resolve(ctx).adjustments[0].delta, 5);
  });

  it("ne casse pas sans match choisi", () => {
    const ctx: ResolveContext = {
      usage: makeUsage({ powerCode: "oracle" }),
      power: makePower("oracle"),
      fixtureScores: new Map(),
      roundTotals: new Map(),
    };
    const res = mirror.resolve(ctx);
    assert.equal(res.adjustments.length, 0);
    assert.equal(res.outcome.error, "no_fixture");
  });
});

describe("sabotage", () => {
  it("retire des points à la cible, plafonnés par la config", () => {
    const ctx: ResolveContext = {
      usage: makeUsage({ powerCode: "sabotage", targetId: "bob", snapshotBefore: { fixtureId: "fix-1" } }),
      power: makePower("sabotage", { max_penalty: 3 }),
      fixtureScores: new Map([["fix-1", new Map([["bob", 10]])]]),
      roundTotals: new Map([["bob", 10]]),
    };
    const res = sabotage.resolve(ctx);
    assert.equal(res.adjustments.length, 1);
    assert.equal(res.adjustments[0].userId, "bob");
    assert.equal(res.adjustments[0].delta, -3);
  });

  it("ne retire jamais plus que ce que la cible a marqué", () => {
    const ctx: ResolveContext = {
      usage: makeUsage({ powerCode: "sabotage", targetId: "bob", snapshotBefore: { fixtureId: "fix-1" } }),
      power: makePower("sabotage", { max_penalty: 3 }),
      fixtureScores: new Map([["fix-1", new Map([["bob", 1]])]]),
      roundTotals: new Map([["bob", 1]]),
    };
    const res = sabotage.resolve(ctx);
    assert.equal(res.adjustments[0].delta, -1);
  });

  it("est perdu si la cible n'a rien marqué", () => {
    const ctx: ResolveContext = {
      usage: makeUsage({ powerCode: "sabotage", targetId: "bob", snapshotBefore: { fixtureId: "fix-1" } }),
      power: makePower("sabotage", { max_penalty: 3 }),
      fixtureScores: new Map([["fix-1", new Map([["bob", 0]])]]),
      roundTotals: new Map([["bob", 0]]),
    };
    const res = sabotage.resolve(ctx);
    assert.equal(res.adjustments.length, 0);
    assert.equal(res.outcome.penalty, 0);
  });

  it("refuse de se saboter soi-même", () => {
    const r = sabotage.validateDeclaration({
      initiatorId: "alice", targetId: "alice", fixtureId: "fix-1",
      power: makePower("sabotage"), standings: [],
    });
    assert.equal(r.valid, false);
  });
});

describe("coût en crédits", () => {
  it("lit le coût depuis la config", () => {
    assert.equal(creditCost(makePower("joker", { credit_cost: 5 })), 5);
  });

  it("retombe sur le défaut quand la config n'en déclare pas", () => {
    assert.equal(creditCost(makePower("joker")), FALLBACK_CREDIT_COST);
    assert.equal(creditCost(makePower("joker"), 7), 7);
  });

  it("ignore une valeur aberrante plutôt que de rendre un pouvoir gratuit", () => {
    assert.equal(creditCost(makePower("joker", { credit_cost: -2 }), 4), 4);
    assert.equal(creditCost(makePower("joker", { credit_cost: "cinq" }), 4), 4);
  });

  it("accepte un pouvoir gratuit déclaré explicitement", () => {
    assert.equal(creditCost(makePower("joker", { credit_cost: 0 })), 0);
  });

  it("renvoie null pour un effet ou des règles absents", () => {
    assert.equal(powerEffect(makePower("joker")), null);
    assert.equal(powerRules(makePower("joker")), null);
    assert.equal(powerEffect(makePower("joker", { effect: "Double." })), "Double.");
  });
});
