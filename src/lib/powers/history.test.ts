import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPowerHistory } from "./history.ts";

/**
 * Faux client minimal, taillé pour `loadPowerHistory` : chaque table est un
 * tableau en mémoire, les filtres (`eq`, `in`) s'accumulent et s'appliquent à
 * l'exécution. Les jointures PostgREST (`powers!inner(...)`,
 * `rounds!inner(...)`, `home:home_team_id(...)`) sont résolues à la main,
 * puisque c'est tout ce que cette fonction utilise réellement.
 */
type Row = Record<string, unknown>;

function makeDb() {
  return {
    leagues: [] as Row[],
    seasons: [] as Row[],
    power_usages: [] as Row[],
    profiles: [] as Row[],
    fixtures: [] as Row[],
  };
}

/** Lit `"rounds.season_id"` sur une ligne déjà enrichie par `embed`. */
function valueAt(row: Row, col: string): unknown {
  if (col in row) return row[col];
  const [head, ...rest] = col.split(".");
  if (rest.length === 0) return undefined;
  const nested = row[head];
  return nested && typeof nested === "object" ? (nested as Row)[rest.join(".")] : undefined;
}

function fakeClient(db: ReturnType<typeof makeDb>): SupabaseClient {
  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let orderCol: string | null = null;
    let orderAsc = true;

    const rowsOf = (t: string): Row[] => (db as unknown as Record<string, Row[]>)[t] ?? [];

    const builder = {
      select() {
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
      order(col: string, opts?: { ascending?: boolean }) {
        orderCol = col;
        orderAsc = opts?.ascending ?? true;
        return builder;
      },
      maybeSingle() {
        return resolve(true);
      },
      then(resolveFn: (v: unknown) => void, rejectFn?: (e: unknown) => void) {
        return resolve(false).then(resolveFn, rejectFn);
      },
    };

    function embed(row: Row): Row {
      const out: Row = { ...row };
      if (table === "power_usages") {
        const power = (db as unknown as { powers?: Row[] }).powers?.find(
          (p) => p.id === row.power_id,
        );
        out.powers = power
          ? { code: power.code, name: power.name, emoji: power.emoji }
          : null;
        const round = (db as unknown as { rounds?: Row[] }).rounds?.find(
          (r) => r.id === row.round_id,
        );
        out.rounds = round
          ? { number: round.number, name: round.name, season_id: round.season_id }
          : null;
      }
      return out;
    }

    async function resolve(single: boolean) {
      let rows = rowsOf(table).map(embed).filter((r) => filters.every((f) => f(r)));
      if (orderCol) {
        rows = [...rows].sort((a, b) => {
          const av = a[orderCol as string] as string;
          const bv = b[orderCol as string] as string;
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return orderAsc ? cmp : -cmp;
        });
      }
      if (single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    return builder;
  }

  return { from } as unknown as SupabaseClient;
}

function seed(db: ReturnType<typeof makeDb> & { powers?: Row[]; rounds?: Row[] }) {
  db.leagues.push({ id: "league-1", competition_id: "comp-1" });
  db.seasons.push({ id: "season-1", competition_id: "comp-1" });
  db.powers = [
    { id: "power-sabotage", code: "sabotage", name: "Sabotage", emoji: "💣" },
  ];
  db.rounds = [
    { id: "round-open", number: 6, name: "J6", season_id: "season-1" },
  ];
  db.profiles.push(
    { id: "hugo", display_name: "Hugo", first_name: "Hugo", avatar_kind: "emoji", avatar_value: "🏉" },
    { id: "pierre", display_name: "Pierre", first_name: "Pierre", avatar_kind: "emoji", avatar_value: "🏉" },
  );
  // Journée round-open encore ouverte : un match ferme loin dans le futur.
  db.fixtures.push({
    id: "fx-1",
    round_id: "round-open",
    locks_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  });
}

describe("loadPowerHistory — visibilité des propres déclarations avant verrouillage", () => {
  it("l'auteur voit sa propre déclaration même journée non verrouillée", async () => {
    const db = makeDb() as ReturnType<typeof makeDb> & { powers?: Row[]; rounds?: Row[] };
    seed(db);
    db.power_usages.push({
      id: "usage-1",
      initiator_id: "hugo",
      target_id: "pierre",
      round_id: "round-open",
      state: "declared",
      snapshot_before: {},
      result: null,
      created_at: new Date().toISOString(),
      power_id: "power-sabotage",
    });

    const sb = fakeClient(db);
    const asHugo = await loadPowerHistory(sb, "league-1", { viewerId: "hugo" });
    assert.equal(asHugo.rounds.length, 1, "Hugo doit voir sa propre déclaration");
    assert.equal(asHugo.rounds[0].entries[0].playerName, "Hugo");
  });

  it("un tiers ne voit rien tant que la journée n'a pas verrouillé", async () => {
    const db = makeDb() as ReturnType<typeof makeDb> & { powers?: Row[]; rounds?: Row[] };
    seed(db);
    db.power_usages.push({
      id: "usage-2",
      initiator_id: "hugo",
      target_id: "pierre",
      round_id: "round-open",
      state: "declared",
      snapshot_before: {},
      result: null,
      created_at: new Date().toISOString(),
      power_id: "power-sabotage",
    });

    const sb = fakeClient(db);
    const asSomeoneElse = await loadPowerHistory(sb, "league-1", { viewerId: "autre-joueur" });
    assert.equal(asSomeoneElse.rounds.length, 0, "personne d'autre ne doit rien voir avant verrouillage");
  });

  it("sans viewerId (page publique), rien ne fuite non plus avant verrouillage", async () => {
    const db = makeDb() as ReturnType<typeof makeDb> & { powers?: Row[]; rounds?: Row[] };
    seed(db);
    db.power_usages.push({
      id: "usage-3",
      initiator_id: "hugo",
      target_id: "pierre",
      round_id: "round-open",
      state: "declared",
      snapshot_before: {},
      result: null,
      created_at: new Date().toISOString(),
      power_id: "power-sabotage",
    });

    const sb = fakeClient(db);
    const anonymous = await loadPowerHistory(sb, "league-1", {});
    assert.equal(anonymous.rounds.length, 0);
  });
});
