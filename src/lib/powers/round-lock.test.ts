import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadRoundRevealTimes,
  loadRoundRevealTime,
  loadRoundFirstLockTimes,
  loadRoundFirstLockTime,
} from "./round-lock.ts";

/** Même motif que `round-totals.test.ts` : un faux client minimal, suffisant
 * pour tester l'AGRÉGATION (le max par journée), pas la forme des requêtes. */
function fakeClient(fixtures: Array<{ round_id: string; locks_at: string }>): SupabaseClient {
  return {
    from() {
      const builder = {
        select() { return builder; },
        in() { return builder; },
        then(resolve: (v: { data: unknown[]; error: null }) => void) {
          resolve({ data: fixtures, error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("loadRoundRevealTimes — dernier verrouillage par journée, pas le premier", () => {
  it("retient le PLUS TARDIF locks_at parmi les matchs d'une journée, pas le plus tôt", async () => {
    const sb = fakeClient([
      { round_id: "round-1", locks_at: "2026-10-03T12:25:00Z" },
      { round_id: "round-1", locks_at: "2026-10-04T19:00:00Z" }, // le dernier à fermer
      { round_id: "round-1", locks_at: "2026-10-03T14:30:00Z" },
    ]);

    const times = await loadRoundRevealTimes(sb, ["round-1"]);
    assert.equal(times.get("round-1"), "2026-10-04T19:00:00Z");
  });

  it("deux journées distinctes gardent chacune leur propre maximum", async () => {
    const sb = fakeClient([
      { round_id: "round-1", locks_at: "2026-10-03T12:25:00Z" },
      { round_id: "round-2", locks_at: "2026-10-10T19:00:00Z" },
      { round_id: "round-1", locks_at: "2026-10-04T19:00:00Z" },
    ]);

    const times = await loadRoundRevealTimes(sb, ["round-1", "round-2"]);
    assert.equal(times.get("round-1"), "2026-10-04T19:00:00Z");
    assert.equal(times.get("round-2"), "2026-10-10T19:00:00Z");
  });

  it("une journée sans aucun match connu est absente de la map (jamais null par erreur)", async () => {
    const sb = fakeClient([]);
    const times = await loadRoundRevealTimes(sb, ["round-vide"]);
    assert.equal(times.has("round-vide"), false);
    assert.equal(times.get("round-vide") ?? null, null);
  });

  it("loadRoundRevealTime (singulier) renvoie directement la valeur, ou null", async () => {
    const sb = fakeClient([{ round_id: "round-1", locks_at: "2026-10-04T19:00:00Z" }]);
    assert.equal(await loadRoundRevealTime(sb, "round-1"), "2026-10-04T19:00:00Z");
    assert.equal(await loadRoundRevealTime(sb, "autre"), null);
  });
});

describe("loadRoundFirstLockTimes — premier verrouillage par journée, pas le dernier", () => {
  it("retient le PLUS TÔT locks_at parmi les matchs d'une journée, pas le plus tardif", async () => {
    const sb = fakeClient([
      { round_id: "round-1", locks_at: "2026-10-04T19:00:00Z" },
      { round_id: "round-1", locks_at: "2026-10-03T12:25:00Z" }, // le premier à fermer
      { round_id: "round-1", locks_at: "2026-10-03T14:30:00Z" },
    ]);

    const times = await loadRoundFirstLockTimes(sb, ["round-1"]);
    assert.equal(times.get("round-1"), "2026-10-03T12:25:00Z");
  });

  it("deux journées distinctes gardent chacune leur propre minimum", async () => {
    const sb = fakeClient([
      { round_id: "round-1", locks_at: "2026-10-04T19:00:00Z" },
      { round_id: "round-2", locks_at: "2026-10-11T19:00:00Z" },
      { round_id: "round-1", locks_at: "2026-10-03T12:25:00Z" },
    ]);

    const times = await loadRoundFirstLockTimes(sb, ["round-1", "round-2"]);
    assert.equal(times.get("round-1"), "2026-10-03T12:25:00Z");
    assert.equal(times.get("round-2"), "2026-10-11T19:00:00Z");
  });

  it("une journée sans aucun match connu est absente de la map", async () => {
    const sb = fakeClient([]);
    const times = await loadRoundFirstLockTimes(sb, ["round-vide"]);
    assert.equal(times.has("round-vide"), false);
  });

  it("loadRoundFirstLockTime (singulier) renvoie directement la valeur, ou null", async () => {
    const sb = fakeClient([{ round_id: "round-1", locks_at: "2026-10-03T12:25:00Z" }]);
    assert.equal(await loadRoundFirstLockTime(sb, "round-1"), "2026-10-03T12:25:00Z");
    assert.equal(await loadRoundFirstLockTime(sb, "autre"), null);
  });
});
