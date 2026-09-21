import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { rateLimit } from "./rate-limit.ts";

describe("rateLimit", () => {
  test("autorise jusqu'à la limite, puis refuse", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      const r = rateLimit(key, { limit: 3, windowMs: 60_000 });
      assert.equal(r.ok, true, `appel ${i + 1} devrait passer`);
    }
    const blocked = rateLimit(key, { limit: 3, windowMs: 60_000 });
    assert.equal(blocked.ok, false);
    assert.ok(blocked.retryAfterSeconds > 0);
  });

  test("deux clés distinctes ont des compteurs indépendants", () => {
    const a = `test-a-${Math.random()}`;
    const b = `test-b-${Math.random()}`;
    for (let i = 0; i < 5; i++) rateLimit(a, { limit: 5, windowMs: 60_000 });
    const stillOkForB = rateLimit(b, { limit: 5, windowMs: 60_000 });
    assert.equal(stillOkForB.ok, true);
  });

  test("la fenêtre expirée réinitialise le compteur", async () => {
    const key = `test-window-${Math.random()}`;
    const r1 = rateLimit(key, { limit: 1, windowMs: 20 });
    assert.equal(r1.ok, true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const r2 = rateLimit(key, { limit: 1, windowMs: 20 });
    assert.equal(r2.ok, true);
  });
});
