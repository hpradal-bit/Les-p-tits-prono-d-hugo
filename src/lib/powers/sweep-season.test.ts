import { test } from "node:test";
import assert from "node:assert/strict";
import { sweepOrphanedPowers } from "./resolve.ts";

/**
 * Le pouvoir d'un joueur posé sur une compétition de test ne doit jamais
 * remonter dans le classement d'une autre compétition.
 *
 * Panne réelle du 17 septembre : le balayage prenait la saison **active**
 * (Top 14) pour tous les pouvoirs en attente, y compris ceux d'une journée de
 * Pro D2. L'Oracle de Pierre, joué sur Provence - SU Agen, a ainsi crédité
 * deux points dans son total Top 14 — assez pour qu'il réclame 13 points là où
 * il en avait 11.
 *
 * La saison doit venir de la **journée du pouvoir**, jamais du contexte.
 */

interface Row {
  id: string;
  round_id: string;
  snapshot_before: Record<string, unknown>;
  state: string;
  powers: { config: Record<string, unknown> };
  rounds: { season_id: string };
}

/** Client minimal : juste ce que `sweepOrphanedPowers` interroge. */
function clientWith(rows: Row[], fixtureStatus: Record<string, string>) {
  const resolveCalls: Array<{ fixtureId: string; roundId: string; seasonId: string }> = [];

  const client = {
    from(table: string) {
      if (table === "power_usages") {
        return {
          select: () => ({ in: async () => ({ data: rows, error: null }) }),
        };
      }
      if (table === "fixtures") {
        return {
          select: () => ({
            in: async (_col: string, ids: string[]) => ({
              data: ids.map((id) => ({ id, status: fixtureStatus[id] ?? "scheduled" })),
              error: null,
            }),
          }),
        };
      }
      throw new Error(`table inattendue : ${table}`);
    },
  };

  return { client, resolveCalls };
}

test("le balayage n'interroge que les pouvoirs en attente", async () => {
  const { client } = clientWith([], {});
  const out = await sweepOrphanedPowers(client as never);
  assert.equal(out.resolved, 0);
  assert.deepEqual(out.pending, []);
});

test("un pouvoir sans match attend la clôture : il n'est pas orphelin", async () => {
  // Le Duel n'a pas de match : il se résout à la clôture de la journée. Le
  // balayage doit le laisser tranquille, pas le forcer.
  const rows: Row[] = [
    {
      id: "duel-1",
      round_id: "r1",
      snapshot_before: { targetId: "bob" },
      state: "declared",
      powers: { config: { resolves_at: "round_settled" } },
      rounds: { season_id: "saison-top14" },
    },
  ];
  const { client } = clientWith(rows, {});
  const out = await sweepOrphanedPowers(client as never);
  assert.equal(out.resolved, 0);
  assert.deepEqual(out.pending, ["duel-1"]);
});

test("un pouvoir dont le match n'est pas fini reste en attente", async () => {
  const rows: Row[] = [
    {
      id: "joker-live",
      round_id: "r1",
      snapshot_before: { fixtureId: "fx-en-cours" },
      state: "declared",
      powers: { config: { resolves_at: "fixture_finished" } },
      rounds: { season_id: "saison-top14" },
    },
  ];
  const { client } = clientWith(rows, { "fx-en-cours": "live" });
  const out = await sweepOrphanedPowers(client as never);
  assert.equal(out.resolved, 0);
});

test("une journée sans saison lisible ne fait pas planter le balayage", async () => {
  const rows = [
    {
      id: "orphelin",
      round_id: "r1",
      snapshot_before: { fixtureId: "fx1" },
      state: "declared",
      powers: { config: { resolves_at: "fixture_finished" } },
      rounds: null,
    },
  ] as unknown as Row[];
  const { client } = clientWith(rows, { fx1: "official" });
  const out = await sweepOrphanedPowers(client as never);
  assert.equal(out.resolved, 0);
  assert.deepEqual(out.pending, ["orphelin"]);
});
