import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sweepPowerDeclaredNotifications } from "./power-sweep.ts";

/**
 * Faux client Supabase « base de données en mémoire », mutable d'un appel à
 * l'autre — nécessaire ici car le balayage lit, RÉCLAME (update) puis insère
 * (enqueue), et on veut vérifier qu'un second passage voit bien les effets du
 * premier (idempotence réelle, pas simulée). Chaque table est un tableau
 * d'objets ; les méthodes de filtre (`eq`, `in`, `is`, `not`) s'accumulent et
 * s'appliquent à l'exécution (`then`/`maybeSingle`/`single`).
 */
type Row = Record<string, unknown>;

function makeDb() {
  return {
    power_usages: [] as Row[],
    powers: [] as Row[],
    fixtures: [] as Row[],
    profiles: [] as Row[],
    app_settings: [] as Row[],
    notification_settings: [] as Row[],
    notification_preferences: [] as Row[],
    notifications: [] as Row[],
  };
}

function fakeClient(db: ReturnType<typeof makeDb>): SupabaseClient {
  function from(table: string) {
    let op: "select" | "update" | "insert" = "select";
    let selectCols = "";
    let payload: Row | undefined;
    let countMode: { count?: string; head?: boolean } | null = null;
    const filters: Array<(r: Row) => boolean> = [];

    const rowsOf = (t: string): Row[] => (db as unknown as Record<string, Row[]>)[t] ?? [];

    const builder = {
      select(cols?: string, opts?: { count?: string; head?: boolean }) {
        if (typeof cols === "string") selectCols = cols;
        if (opts) countMode = opts;
        return builder;
      },
      insert(obj: Row) {
        op = "insert";
        payload = obj;
        return builder;
      },
      update(obj: Row) {
        op = "update";
        payload = obj;
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]));
        return builder;
      },
      // Seul usage réel ici : `.not("target_id", "is", null)` => IS NOT NULL.
      not(col: string, _op: string, val: unknown) {
        filters.push((r) => (val === null ? r[col] !== null && r[col] !== undefined : r[col] !== val));
        return builder;
      },
      // Seul usage réel ici : `.is("target_notified_at", null)` => IS NULL.
      is(col: string, val: unknown) {
        filters.push((r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val));
        return builder;
      },
      gte() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      maybeSingle() { return resolve(true); },
      single() { return resolve(true); },
      then(resolveFn: (v: unknown) => void, rejectFn?: (e: unknown) => void) {
        return resolve(false).then(resolveFn, rejectFn);
      },
    };

    async function resolve(single: boolean) {
      if (op === "insert") {
        const row = { ...payload };
        rowsOf(table).push(row);
        return { data: row, error: null };
      }
      if (op === "update") {
        const matched = rowsOf(table).filter((r) => filters.every((f) => f(r)));
        for (const r of matched) Object.assign(r, payload);
        return { data: single ? matched[0] ?? null : matched, error: null };
      }
      // select
      let rows = rowsOf(table).filter((r) => filters.every((f) => f(r)));
      if (table === "power_usages" && selectCols.includes("powers")) {
        rows = rows.map((r) => ({
          ...r,
          powers: db.powers.find((p) => p.id === r.power_id) ?? null,
        }));
      }
      if (countMode) return { data: null, error: null, count: rows.length };
      if (single) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    return builder;
  }

  return { from } as unknown as SupabaseClient;
}

/** Un instant sûrement passé, et un sûrement futur — jamais l'horloge réelle mockée. */
const PAST = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
const FAR_FUTURE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

function seed(db: ReturnType<typeof makeDb>) {
  db.powers.push(
    { id: "power-sabotage", code: "sabotage", emoji: "💣", name: "Sabotage", config: { effect: "Vole des points." } },
    { id: "power-duel", code: "duel", emoji: "⚔️", name: "Duel", config: { effect: "Vole le score." } },
    { id: "power-spy", code: "spy", emoji: "🕵️", name: "Espion", config: { effect: "Révèle un pronostic." } },
  );
  db.profiles.push(
    { id: "hugo", display_name: "Hugo", first_name: "Hugo" },
    { id: "pierre", display_name: "Pierre", first_name: "Pierre" },
  );
  // Catalogue minimal pour que `power_declared` soit bien un type activé —
  // sans lui, `isKindEnabledFor` tomberait sur son propre défaut (activé),
  // mais on le pose explicitement pour ne dépendre d'aucun défaut implicite.
  db.app_settings.push({
    key: "notifications.types",
    value: [{ kind: "power_declared", emoji: "⚔️", label: "Pouvoir", description: "", default_enabled: true, wired: true }],
  });
}

describe("sweepPowerDeclaredNotifications — différé, round-safe, pour tous les pouvoirs", () => {
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    db = makeDb();
    seed(db);
  });

  it("un Sabotage déclaré pendant que la journée a encore un autre match ouvert n'est PAS balayé", async () => {
    db.power_usages.push({
      id: "usage-1", initiator_id: "hugo", target_id: "pierre", round_id: "round-1",
      state: "declared", power_id: "power-sabotage", target_notified_at: null,
    });
    // Un match de la journée a déjà verrouillé, un autre ferme loin dans le futur.
    db.fixtures.push(
      { round_id: "round-1", locks_at: PAST },
      { round_id: "round-1", locks_at: FAR_FUTURE },
    );

    const sb = fakeClient(db);
    const sent = await sweepPowerDeclaredNotifications(sb);

    assert.equal(sent, 0);
    assert.equal(db.notifications.length, 0);
    // La ligne n'est pas réclamée : elle reste candidate au prochain passage.
    assert.equal(db.power_usages[0].target_notified_at, null);
  });

  it("une fois TOUTE la journée verrouillée, le Sabotage est balayé et notifié, une seule fois même après un second passage", async () => {
    db.power_usages.push({
      id: "usage-2", initiator_id: "hugo", target_id: "pierre", round_id: "round-1",
      state: "declared", power_id: "power-sabotage", target_notified_at: null,
    });
    db.fixtures.push(
      { round_id: "round-1", locks_at: PAST }, // tous les matchs de la journée ont verrouillé
    );

    const sb = fakeClient(db);

    const firstSent = await sweepPowerDeclaredNotifications(sb);
    assert.equal(firstSent, 1);
    assert.equal(db.notifications.length, 1);
    assert.notEqual(db.power_usages[0].target_notified_at, null);

    // Rejoué : plus aucune ligne candidate (target_notified_at n'est plus
    // null), donc rien ne repart — jamais un second envoi pour le même usage.
    const secondSent = await sweepPowerDeclaredNotifications(sb);
    assert.equal(secondSent, 0);
    assert.equal(db.notifications.length, 1);
  });

  it("l'Espion est balayé et notifié comme n'importe quel pouvoir, une fois la journée verrouillée", async () => {
    db.power_usages.push({
      id: "usage-3", initiator_id: "hugo", target_id: "pierre", round_id: "round-1",
      state: "declared", power_id: "power-spy", target_notified_at: null,
    });
    // Journée entièrement verrouillée, largement.
    db.fixtures.push({ round_id: "round-1", locks_at: PAST });

    const sb = fakeClient(db);
    const sent = await sweepPowerDeclaredNotifications(sb);

    // Après le coup d'envoi, savoir qu'on a été espionné est amusant, pas un
    // risque — demande explicite de l'hôte : plus d'exception pour l'Espion.
    assert.equal(sent, 1);
    assert.equal(db.notifications.length, 1);
    assert.notEqual(db.power_usages[0].target_notified_at, null);
  });

  it("l'Espion n'est PAS balayé tant que la journée n'a pas entièrement verrouillé", async () => {
    db.power_usages.push({
      id: "usage-3b", initiator_id: "hugo", target_id: "pierre", round_id: "round-1",
      state: "declared", power_id: "power-spy", target_notified_at: null,
    });
    db.fixtures.push(
      { round_id: "round-1", locks_at: PAST },
      { round_id: "round-1", locks_at: FAR_FUTURE },
    );

    const sb = fakeClient(db);
    const sent = await sweepPowerDeclaredNotifications(sb);

    assert.equal(sent, 0);
    assert.equal(db.notifications.length, 0);
    assert.equal(db.power_usages[0].target_notified_at, null);
  });

  it("un Duel et un Sabotage ciblant la même paire, journées différentes, se balayent indépendamment", async () => {
    db.power_usages.push(
      {
        id: "usage-4", initiator_id: "hugo", target_id: "pierre", round_id: "round-locked",
        state: "accepted", power_id: "power-duel", target_notified_at: null,
      },
      {
        id: "usage-5", initiator_id: "pierre", target_id: "hugo", round_id: "round-open",
        state: "declared", power_id: "power-sabotage", target_notified_at: null,
      },
    );
    db.fixtures.push(
      { round_id: "round-locked", locks_at: PAST },
      { round_id: "round-open", locks_at: FAR_FUTURE },
    );

    const sb = fakeClient(db);
    const sent = await sweepPowerDeclaredNotifications(sb);

    assert.equal(sent, 1);
    assert.equal(db.power_usages.find((r) => r.id === "usage-4")?.target_notified_at !== null, true);
    assert.equal(db.power_usages.find((r) => r.id === "usage-5")?.target_notified_at, null);
  });
});
