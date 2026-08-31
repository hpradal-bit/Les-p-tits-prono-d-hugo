import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fakeSupabase } from "../providers/sync/fake-supabase.ts";
import { resolveFixturePowers } from "./resolve.ts";

/**
 * Le bug rapporté : un pouvoir choisi n'avait "pas réellement d'impact" une
 * fois le match terminé. Cause racine : seule la clôture manuelle d'une
 * journée entière déclenchait jamais la résolution d'un pouvoir, alors que
 * le score d'un pronostic, lui, se calcule dès la fin de SON match.
 *
 * Ces tests traversent la vraie chaîne (via le faux client, pas des mocks
 * de fonctions) : ils vérifient qu'un Joker déclaré sur un match a un effet
 * dès que ce match est résolu — et que le rejouer ne le double jamais.
 * `resolve.test.ts` couvre déjà le calcul pur de chaque pouvoir ; ce fichier
 * couvre le déclenchement et l'idempotence, extraits dans `resolve.ts`.
 */
describe("resolveFixturePowers", () => {
  function seedDb() {
    return {
      powers: [
        {
          id: "pow-joker",
          code: "joker",
          name: "Joker",
          emoji: "🛡️",
          description: null,
          config: { multiplier: 2, resolves_at: "fixture_finished" },
          is_active: true,
        },
        // Même code, mais configuré comme un pouvoir qui n'attend que la
        // clôture de toute la journée (le cas réel de Duel) — sert à vérifier
        // que le déclencheur "fin de match" ne le touche jamais.
        {
          id: "pow-round-settled",
          code: "joker",
          name: "Joker (round)",
          emoji: "🛡️",
          description: null,
          config: { multiplier: 2, resolves_at: "round_settled" },
          is_active: true,
        },
      ],
      power_usages: [
        {
          id: "u1",
          token_id: "t1",
          power_id: "pow-joker",
          initiator_id: "alice",
          target_id: null,
          round_id: "r1",
          state: "declared",
          snapshot_before: { fixtureId: "fx1", creditCost: 5 },
          result: null,
          created_at: new Date().toISOString(),
          resolved_at: null,
          powers: { code: "joker" },
        },
        {
          id: "u2",
          token_id: "t2",
          power_id: "pow-round-settled",
          initiator_id: "bob",
          target_id: null,
          round_id: "r1",
          state: "declared",
          snapshot_before: { fixtureId: "fx1", creditCost: 5 },
          result: null,
          created_at: new Date().toISOString(),
          resolved_at: null,
          powers: { code: "joker" },
        },
      ],
      fixtures: [{ id: "fx1", round_id: "r1" }],
      prediction_scores: [
        { points: 3, fixture_id: "fx1", predictions: { user_id: "alice", fixture_id: "fx1" } },
        { points: 5, fixture_id: "fx1", predictions: { user_id: "bob", fixture_id: "fx1" } },
      ],
      point_adjustments: [],
      events: [],
    };
  }

  it("applique le Joker dès la fin du match (3 pts de base -> +3)", async () => {
    const { client, db } = fakeSupabase(seedDb());
    const result = await resolveFixturePowers(client, "fx1", "r1", "s1");

    assert.equal(result.resolved, 1);
    assert.equal(db.point_adjustments.length, 1);
    assert.equal(db.point_adjustments[0].user_id, "alice");
    assert.equal(db.point_adjustments[0].delta, 3); // 3 pts de base x2 = +3
    assert.equal(db.point_adjustments[0].source, "power:joker");
    assert.equal(db.point_adjustments[0].source_id, "u1");

    const u1 = db.power_usages.find((u: Record<string, unknown>) => u.id === "u1")!;
    assert.equal(u1.state, "resolved");
  });

  it("ne double jamais l'effet si le déclencheur repasse sur le même match", async () => {
    const { client, db } = fakeSupabase(seedDb());
    await resolveFixturePowers(client, "fx1", "r1", "s1");
    const second = await resolveFixturePowers(client, "fx1", "r1", "s1");

    assert.equal(second.resolved, 0);
    assert.equal(db.point_adjustments.length, 1, "un seul ajustement, jamais deux");
  });

  it("laisse en attente un pouvoir configuré pour la clôture de journée", async () => {
    const { client, db } = fakeSupabase(seedDb());
    await resolveFixturePowers(client, "fx1", "r1", "s1");

    const u2 = db.power_usages.find((u: Record<string, unknown>) => u.id === "u2")!;
    assert.equal(u2.state, "declared", "resolves_at=round_settled attend la clôture, pas la fin du match");
    assert.equal(
      db.point_adjustments.some((a: Record<string, unknown>) => a.source_id === "u2"),
      false,
    );
  });
});
