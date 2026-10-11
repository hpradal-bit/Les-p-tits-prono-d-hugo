import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRoundPointsSummary } from "./queries.ts";

/**
 * Faux client minimal pour `loadRoundPointsSummary` : chaque table un
 * tableau en mémoire, filtres `eq`/`in`/`like` accumulés puis appliqués à
 * l'exécution. Les jointures PostgREST utilisées ici (`predictions!inner`,
 * `powers!inner`) sont résolues à la main.
 */
type Row = Record<string, unknown>;

function makeDb() {
  return {
    fixtures: [] as Row[],
    predictions: [] as Row[],
    prediction_scores: [] as Row[],
    point_adjustments: [] as Row[],
    power_usages: [] as Row[],
    powers: [] as Row[],
  };
}

/** Lit `"predictions.user_id"` sur une ligne déjà enrichie par `embed`. */
function valueAt(row: Row, col: string): unknown {
  if (col in row) return row[col];
  const [head, ...rest] = col.split(".");
  if (rest.length === 0) return undefined;
  const nested = row[head];
  return nested && typeof nested === "object" ? (nested as Row)[rest.join(".")] : undefined;
}

function fakeClient(db: ReturnType<typeof makeDb>): SupabaseClient {
  function from(table: string) {
    let selectCols = "";
    const filters: Array<(r: Row) => boolean> = [];

    const rowsOf = (t: string): Row[] => (db as unknown as Record<string, Row[]>)[t] ?? [];

    const builder = {
      select(cols?: string) {
        if (typeof cols === "string") selectCols = cols;
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => valueAt(r, col) === val);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(valueAt(r, col)));
        return builder;
      },
      like(col: string, pattern: string) {
        const prefix = pattern.replace(/%$/, "");
        filters.push((r) => {
          const v = valueAt(r, col);
          return typeof v === "string" && v.startsWith(prefix);
        });
        return builder;
      },
      then(resolveFn: (v: unknown) => void, rejectFn?: (e: unknown) => void) {
        return resolve().then(resolveFn, rejectFn);
      },
    };

    function embed(row: Row): Row {
      if (table === "prediction_scores" && selectCols.includes("predictions!inner")) {
        const pred = db.predictions.find((p) => p.id === row.prediction_id);
        return { ...row, predictions: pred ? { user_id: pred.user_id, fixture_id: pred.fixture_id } : null };
      }
      if (table === "power_usages" && selectCols.includes("powers!inner")) {
        const power = db.powers.find((p) => p.id === row.power_id);
        return { ...row, powers: power ? { code: power.code, emoji: power.emoji, name: power.name } : null };
      }
      return row;
    }

    async function resolve() {
      const rows = rowsOf(table).map(embed).filter((r) => filters.every((f) => f(r)));
      return { data: rows, error: null };
    }

    return builder;
  }

  return { from } as unknown as SupabaseClient;
}

describe("loadRoundPointsSummary", () => {
  it("reproduit le cas réel journée 5 : Hugo et Pierre à 7 points chacun (Oracle +2, Sabotage -1)", async () => {
    const db = makeDb();
    const round = "round-5";
    db.fixtures.push(
      { id: "fx-1", round_id: round }, { id: "fx-2", round_id: round },
      { id: "fx-3", round_id: round }, { id: "fx-4", round_id: round },
      { id: "fx-5", round_id: round }, { id: "fx-6", round_id: round },
      { id: "fx-7", round_id: round },
    );
    // Hugo : 6 pronostics marquants (1 chacun), un raté (fx-6).
    db.predictions.push(
      { id: "p1", user_id: "hugo", fixture_id: "fx-1" },
      { id: "p2", user_id: "hugo", fixture_id: "fx-2" },
      { id: "p3", user_id: "hugo", fixture_id: "fx-3" },
      { id: "p4", user_id: "hugo", fixture_id: "fx-4" },
      { id: "p5", user_id: "hugo", fixture_id: "fx-5" },
      { id: "p6", user_id: "hugo", fixture_id: "fx-6" },
      { id: "p7", user_id: "hugo", fixture_id: "fx-7" },
    );
    db.prediction_scores.push(
      { prediction_id: "p1", points: 1 }, { prediction_id: "p2", points: 1 },
      { prediction_id: "p3", points: 1 }, { prediction_id: "p4", points: 1 },
      { prediction_id: "p5", points: 1 }, { prediction_id: "p6", points: 0 },
      { prediction_id: "p7", points: 1 },
    );
    db.powers.push(
      { id: "power-oracle", code: "oracle", name: "Oracle", emoji: "🔮" },
      { id: "power-sabotage", code: "sabotage", name: "Sabotage", emoji: "💣" },
    );
    db.power_usages.push(
      { id: "usage-oracle-hugo", power_id: "power-oracle" },
      { id: "usage-sabotage-on-hugo", power_id: "power-sabotage" },
    );
    db.point_adjustments.push(
      { user_id: "hugo", round_id: round, source: "power:oracle", source_id: "usage-oracle-hugo", delta: 2 },
      { user_id: "hugo", round_id: round, source: "power:sabotage", source_id: "usage-sabotage-on-hugo", delta: -1 },
      // Bruit : un ajustement d'un AUTRE joueur sur la même journée ne doit pas apparaître.
      { user_id: "pierre", round_id: round, source: "power:oracle", source_id: "usage-oracle-hugo", delta: 99 },
    );

    const sb = fakeClient(db);
    const summary = await loadRoundPointsSummary(sb, "hugo", round);

    assert.equal(summary.basePoints, 6);
    assert.equal(summary.total, 7);
    assert.equal(summary.powerItems.length, 2);
    const oracle = summary.powerItems.find((i) => i.code === "oracle");
    const sabotage = summary.powerItems.find((i) => i.code === "sabotage");
    assert.equal(oracle?.delta, 2);
    assert.equal(sabotage?.delta, -1);
  });

  it("deux usages du même pouvoir s'additionnent sur une seule ligne", async () => {
    const db = makeDb();
    db.fixtures.push({ id: "fx-1" });
    db.powers.push({ id: "power-sabotage", code: "sabotage", name: "Sabotage", emoji: "💣" });
    db.power_usages.push(
      { id: "usage-1", power_id: "power-sabotage" },
      { id: "usage-2", power_id: "power-sabotage" },
    );
    db.point_adjustments.push(
      { user_id: "hugo", round_id: "round-x", source: "power:sabotage", source_id: "usage-1", delta: -1 },
      { user_id: "hugo", round_id: "round-x", source: "power:sabotage", source_id: "usage-2", delta: -1 },
    );

    const sb = fakeClient(db);
    const summary = await loadRoundPointsSummary(sb, "hugo", "round-x");

    assert.equal(summary.powerItems.length, 1);
    assert.equal(summary.powerItems[0].delta, -2);
    assert.equal(summary.total, -2);
  });

  it("aucun match noté : total nul, pas d'erreur", async () => {
    const db = makeDb();
    db.fixtures.push({ id: "fx-1" });

    const sb = fakeClient(db);
    const summary = await loadRoundPointsSummary(sb, "hugo", "round-empty");

    assert.equal(summary.basePoints, 0);
    assert.equal(summary.powerItems.length, 0);
    assert.equal(summary.total, 0);
  });
});
