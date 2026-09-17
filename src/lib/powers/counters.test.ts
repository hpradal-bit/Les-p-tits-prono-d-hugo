import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPowerCounters } from "./counters.ts";
import type { Power } from "./types.ts";

function power(id: string, name: string, max?: number): Power {
  return {
    id,
    code: id,
    name,
    emoji: "✨",
    description: null,
    config: max === undefined ? {} : { max_uses_per_player: max },
    isActive: true,
  };
}

const PLAYERS = [
  { userId: "a", firstName: "Anne" },
  { userId: "b", firstName: "Bob" },
];

test("compte les usages et ce qu'il reste", () => {
  const rows = buildPowerCounters(
    PLAYERS,
    [power("spy", "Espion")],
    new Map([["a", new Map([["spy", 2]])]]),
  );
  const anne = rows.find((r) => r.userId === "a")!;
  assert.equal(anne.cells[0].used, 2);
  assert.equal(anne.cells[0].remaining, 1);
  assert.equal(anne.cells[0].exhausted, false);
  const bob = rows.find((r) => r.userId === "b")!;
  assert.equal(bob.cells[0].used, 0);
  assert.equal(bob.cells[0].remaining, 3);
});

test("un quota épuisé s'éteint", () => {
  const rows = buildPowerCounters(
    [PLAYERS[0]],
    [power("spy", "Espion")],
    new Map([["a", new Map([["spy", 3]])]]),
  );
  assert.equal(rows[0].cells[0].exhausted, true);
  assert.equal(rows[0].cells[0].remaining, 0);
});

test("le plafond du pouvoir prime sur le réglage global", () => {
  const rows = buildPowerCounters([PLAYERS[0]], [power("duel", "Duel", 1)], new Map(), 3);
  assert.equal(rows[0].cells[0].max, 1);
});

test("un dépassement ne rend jamais un reste négatif", () => {
  const rows = buildPowerCounters(
    [PLAYERS[0]],
    [power("spy", "Espion", 1)],
    new Map([["a", new Map([["spy", 4]])]]),
  );
  assert.equal(rows[0].cells[0].remaining, 0);
  assert.equal(rows[0].totalRemaining, 0);
});

test("les colonnes gardent le même ordre pour tout le monde", () => {
  const rows = buildPowerCounters(
    PLAYERS,
    [power("z", "Zeus"), power("a", "Arbitre")],
    new Map(),
  );
  for (const row of rows) {
    assert.deepEqual(row.cells.map((c) => c.name), ["Arbitre", "Zeus"]);
  }
});

test("le plus gros consommateur apparaît en premier", () => {
  const rows = buildPowerCounters(
    PLAYERS,
    [power("spy", "Espion")],
    new Map([["b", new Map([["spy", 2]])]]),
  );
  assert.deepEqual(rows.map((r) => r.firstName), ["Bob", "Anne"]);
});
