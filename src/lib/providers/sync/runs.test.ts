import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fakeSupabase } from "./fake-supabase.ts";
import { openRun, closeRun } from "./runs.ts";

/**
 * Audit technique, point 6 (P2) : anti-concurrence des synchronisations.
 * `openRun` doit refléter fidèlement ce que renvoie `try_acquire_sync_lock`
 * (`run.locked`), et `closeRun` doit toujours relâcher le verrou qu'il a pris
 * — jamais celui d'un run qui ne l'avait pas obtenu.
 */

/** Un client dont le verrou se comporte comme le ferait try_acquire_sync_lock. */
function clientWithLock(initiallyLocked: boolean) {
  const { client } = fakeSupabase({});
  let locked = false;
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      ...client,
      rpc(fn: string, args: unknown) {
        calls.push({ fn, args });
        if (fn === "try_acquire_sync_lock") {
          if (locked) return Promise.resolve({ data: false, error: null });
          locked = true;
          return Promise.resolve({ data: true, error: null });
        }
        if (fn === "release_sync_lock") {
          locked = initiallyLocked ? locked : false;
          locked = false;
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

describe("openRun / closeRun — verrou anti-concurrence", () => {
  test("openRun renvoie locked=true quand le verrou est libre", async () => {
    const { client } = clientWithLock(false);
    const run = await openRun(client, "live");
    assert.equal(run.locked, true);
    assert.equal(run.kind, "live");
  });

  test("un deuxième openRun du même kind échoue tant que le premier n'a pas fermé", async () => {
    const { client } = clientWithLock(false);
    const first = await openRun(client, "live");
    const second = await openRun(client, "live");
    assert.equal(first.locked, true);
    assert.equal(second.locked, false);
  });

  test("closeRun relâche le verrou, ce qui permet à l'openRun suivant de réussir", async () => {
    const { client } = clientWithLock(false);
    const first = await openRun(client, "live");
    assert.equal(first.locked, true);

    await closeRun(client, first, {
      status: "success",
      provider: "chain",
      requestsUsed: 1,
      fixturesUpdated: 0,
    });

    const second = await openRun(client, "live");
    assert.equal(second.locked, true);
  });

  test("un run qui n'a pas obtenu le verrou (locked=false) n'appelle pas release_sync_lock à sa fermeture", async () => {
    const { client, calls } = clientWithLock(false);
    await openRun(client, "live"); // prend le verrou
    const second = await openRun(client, "live"); // échoue
    assert.equal(second.locked, false);

    calls.length = 0;
    await closeRun(client, second, {
      status: "skipped",
      provider: "aucun",
      requestsUsed: 0,
      fixturesUpdated: 0,
    });
    assert.equal(calls.some((c) => c.fn === "release_sync_lock"), false);
  });

  test("openRun accorde le verrou quand la fonction SQL n'est pas encore déployée (erreur RPC)", async () => {
    const { client } = fakeSupabase({});
    // Avant l'application de la migration 0063 en production, `.rpc` échoue
    // (fonction inconnue) : la synchro doit continuer à fonctionner comme
    // avant plutôt que de se bloquer indéfiniment.
    const withFailingRpc = {
      ...client,
      rpc: () => Promise.resolve({ data: null, error: { message: "function does not exist" } }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const run = await openRun(withFailingRpc, "calendar");
    assert.equal(run.locked, true);
  });
});
