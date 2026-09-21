import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { logger, newRequestId, requestLogger } from "./log.ts";

/** Capture les lignes écrites sur stdout/stderr le temps d'un test. */
function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = (msg: string) => lines.push(msg);
  console.warn = (msg: string) => lines.push(msg);
  console.error = (msg: string) => lines.push(msg);
  return {
    lines,
    restore: () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    },
  };
}

describe("logger", () => {
  test("écrit une ligne JSON valide avec level/event/time", () => {
    const cap = captureConsole();
    try {
      logger.info("test.event", { foo: "bar" });
    } finally {
      cap.restore();
    }
    assert.equal(cap.lines.length, 1);
    const parsed = JSON.parse(cap.lines[0]);
    assert.equal(parsed.level, "info");
    assert.equal(parsed.event, "test.event");
    assert.equal(parsed.foo, "bar");
    assert.equal(typeof parsed.time, "string");
  });

  test("sérialise une Error passée en contexte (message, nom, pile)", () => {
    const cap = captureConsole();
    try {
      logger.error("test.failed", { error: new TypeError("boom"), fixtureId: "f-1" });
    } finally {
      cap.restore();
    }
    const parsed = JSON.parse(cap.lines[0]);
    assert.equal(parsed.level, "error");
    assert.equal(parsed.fixtureId, "f-1");
    assert.equal(parsed.error.name, "TypeError");
    assert.equal(parsed.error.message, "boom");
    assert.equal(typeof parsed.error.stack, "string");
  });

  test("with() fixe un contexte sur toutes les lignes suivantes", () => {
    const cap = captureConsole();
    try {
      const child = logger.with({ requestId: "req-123" });
      child.info("a");
      child.warn("b", { extra: 1 });
    } finally {
      cap.restore();
    }
    const [a, b] = cap.lines.map((l) => JSON.parse(l));
    assert.equal(a.requestId, "req-123");
    assert.equal(b.requestId, "req-123");
    assert.equal(b.extra, 1);
  });

  test("requestLogger() sans argument génère un requestId non vide", () => {
    const cap = captureConsole();
    try {
      requestLogger().info("x");
    } finally {
      cap.restore();
    }
    const parsed = JSON.parse(cap.lines[0]);
    assert.equal(typeof parsed.requestId, "string");
    assert.ok(parsed.requestId.length > 0);
  });

  test("newRequestId() renvoie des identifiants distincts", () => {
    assert.notEqual(newRequestId(), newRequestId());
  });
});
