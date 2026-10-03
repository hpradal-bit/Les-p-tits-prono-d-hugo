import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRoundTotals } from "./queries.ts";
import { computeDuelBattle } from "./battle.ts";
import { duel } from "./kinds/duel.ts";
import type { Power, PowerUsage, ResolveContext } from "./types.ts";

/**
 * Faux client Supabase minimal : un `.from(table)` renvoie un builder
 * chaînable (select/eq/in/like/order — tous des no-ops) qui se résout, une
 * fois `await`-é, sur la réponse en boîte pour cette table. Suffisant pour
 * tester l'AGRÉGATION de `loadRoundTotals` (ce qu'elle additionne, ce
 * qu'elle exclut) sans base réelle — la forme des requêtes elles-mêmes
 * (jointures, `!inner`) est le même motif déjà utilisé et éprouvé ailleurs
 * dans ce fichier (`loadFixtureScoresForRound`) et dans
 * `standings/queries.ts`.
 */
function fakeClient(responses: Record<string, unknown[]>): SupabaseClient {
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {
        select() { return builder; },
        eq() { return builder; },
        in() { return builder; },
        like() { return builder; },
        order() { return builder; },
        then(resolve: (v: { data: unknown[]; error: null }) => void) {
          resolve({ data: responses[table] ?? [], error: null });
        },
      };
      return builder;
    },
  };
  return client as unknown as SupabaseClient;
}

describe("loadRoundTotals — pronostics + ajustements power:* (hors power:duel)", () => {
  it("ajoute un bonus Oracle et une pénalité Sabotage au total de pronostics, exclut un ajustement power:duel", async () => {
    const sb = fakeClient({
      fixtures: [{ id: "fix-1" }, { id: "fix-2" }],
      prediction_scores: [
        { points: 5, predictions: { user_id: "hugo", fixture_id: "fix-1" } },
        { points: 5, predictions: { user_id: "pierre", fixture_id: "fix-1" } },
      ],
      point_adjustments: [
        // Oracle de Pierre : +2 — doit compter dans son total de journée.
        { user_id: "pierre", delta: 2, source: "power:oracle" },
        // Sabotage subi par Hugo : -3 — doit compter contre lui.
        { user_id: "hugo", delta: -3, source: "power:sabotage" },
        // Transfert d'un AUTRE Duel déjà résolu sur la même journée : jamais
        // compté dans le total qui sert à en calculer un autre.
        { user_id: "hugo", delta: 100, source: "power:duel" },
      ],
    });

    const totals = await loadRoundTotals(sb, "round-1");

    assert.equal(totals.get("hugo"), 2); // 5 (pronostic) - 3 (Sabotage)
    assert.equal(totals.get("pierre"), 7); // 5 (pronostic) + 2 (Oracle)
  });
});

describe("Duel — le total de journée inclut les autres pouvoirs, en direct comme à la clôture", () => {
  it("un bonus Oracle fait basculer le Duel, et le match en direct annonce le même résultat que la clôture", () => {
    // Même scénario que le vrai Duel Hugo/Pierre de la J5 : pronostics à
    // égalité (5 - 5), mais l'Oracle de Pierre (+2) le fait passer devant.
    const officialPoints = new Map([["hugo", 5], ["pierre", 7]]);
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

    assert.equal(battle.initiatorPoints, 5);
    assert.equal(battle.targetPoints, 7);
    assert.equal(battle.tie, false);
    assert.equal(battle.leaderId, "pierre");

    const usage: PowerUsage = {
      id: "usage-1", tokenId: "", powerId: "power-duel", powerCode: "duel",
      initiatorId: "hugo", targetId: "pierre", roundId: "round-1",
      state: "declared", snapshotBefore: {}, result: null,
      createdAt: new Date().toISOString(), resolvedAt: null,
    };
    const power: Power = {
      id: "power-duel", code: "duel", name: "Duel", emoji: "⚔️",
      description: null, config: {}, isActive: true,
    };
    const ctx: ResolveContext = {
      usage, power, fixtureScores: new Map(), roundTotals: officialPoints,
    };
    const result = duel.resolve(ctx);
    const outcome = result.outcome as { winnerId?: string; transferred?: number };

    // Même meneur, même transfert, que la vue en direct avait déjà annoncé.
    assert.equal(outcome.winnerId, "pierre");
    assert.equal(outcome.transferred, 5); // loserPts = total du perdant (Hugo)
    assert.equal(battle.leaderId, outcome.winnerId);
  });

  it("une pénalité Sabotage contre le meneur peut renverser le Duel — direct et clôture tombent sur le même vainqueur", () => {
    // Hugo mène 8-5 sur les pronostics, mais un Sabotage de 4 points contre
    // lui ce même jour le fait retomber à 4, sous Pierre.
    const officialPoints = new Map([["hugo", 4], ["pierre", 5]]);
    const fixtures = [{ id: "f1", status: "official" as const }];

    const battle = computeDuelBattle({
      initiatorId: "hugo",
      targetId: "pierre",
      fixtures,
      officialPoints,
      liveContributions: [],
    });

    const usage: PowerUsage = {
      id: "usage-2", tokenId: "", powerId: "power-duel", powerCode: "duel",
      initiatorId: "hugo", targetId: "pierre", roundId: "round-1",
      state: "declared", snapshotBefore: {}, result: null,
      createdAt: new Date().toISOString(), resolvedAt: null,
    };
    const power: Power = {
      id: "power-duel", code: "duel", name: "Duel", emoji: "⚔️",
      description: null, config: {}, isActive: true,
    };
    const result = duel.resolve({ usage, power, fixtureScores: new Map(), roundTotals: officialPoints });
    const outcome = result.outcome as { winnerId?: string; transferred?: number };

    assert.equal(outcome.winnerId, "pierre");
    assert.equal(outcome.transferred, 4);
    assert.equal(battle.leaderId, outcome.winnerId);
    assert.equal(battle.targetPoints, 5);
    assert.equal(battle.initiatorPoints, 4);
  });
});
