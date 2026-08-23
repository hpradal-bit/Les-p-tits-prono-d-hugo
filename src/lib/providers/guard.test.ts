import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calendarRequestSchema,
  checkSyncSecret,
  liveRequestSchema,
  readBody,
} from "./sync/guard.ts";

const SECRET = "un-secret-de-synchronisation-assez-long";

function request(headers: Record<string, string> = {}, body?: unknown): Request {
  return new Request("https://exemple.test/api/sync/live", {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// --- Le secret partagé -------------------------------------------------------

test("secret : accepté dans x-sync-secret", () => {
  process.env.SYNC_SECRET = SECRET;
  assert.deepEqual(checkSyncSecret(request({ "x-sync-secret": SECRET })), { ok: true });
});

test("secret : accepté en Authorization: Bearer", () => {
  process.env.SYNC_SECRET = SECRET;
  assert.deepEqual(
    checkSyncSecret(request({ authorization: `Bearer ${SECRET}` })),
    { ok: true },
  );
});

test("secret : sans en-tête, c'est 401", () => {
  process.env.SYNC_SECRET = SECRET;
  const result = checkSyncSecret(request());
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.status, 401);
});

test("secret : un mauvais secret est refusé, même de la bonne longueur", () => {
  process.env.SYNC_SECRET = SECRET;
  const almost = `${SECRET.slice(0, -1)}X`;
  const result = checkSyncSecret(request({ "x-sync-secret": almost }));
  assert.equal(result.ok, false);
});

test("secret : absent ou trop court côté serveur, la route se coupe (500)", () => {
  delete process.env.SYNC_SECRET;
  let result = checkSyncSecret(request({ "x-sync-secret": "peu importe" }));
  assert.equal(result.ok === false && result.status, 500);

  process.env.SYNC_SECRET = "trop-court";
  result = checkSyncSecret(request({ "x-sync-secret": "trop-court" }));
  assert.equal(result.ok === false && result.status, 500);
  process.env.SYNC_SECRET = SECRET;
});

test("secret : un paramètre d'URL ne suffit jamais", () => {
  process.env.SYNC_SECRET = SECRET;
  const req = new Request(`https://exemple.test/api/sync/live?secret=${SECRET}`, {
    method: "POST",
  });
  assert.equal(checkSyncSecret(req).ok, false);
});

// --- Validation Zod ----------------------------------------------------------

test("validation : un corps vide est accepté (le cas du planificateur)", async () => {
  const result = await readBody(request(), liveRequestSchema);
  assert.equal(result.ok, true);
});

test("validation : une date mal formée est refusée avec un message clair", async () => {
  const result = await readBody(request({}, { date: "5 septembre" }), liveRequestSchema);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.message : "", /AAAA-MM-JJ/);
});

test("validation : une date inexistante est refusée", async () => {
  const result = await readBody(request({}, { date: "2026-13-45" }), liveRequestSchema);
  assert.equal(result.ok, false);
});

test("validation : un identifiant de saison doit être un UUID", async () => {
  const result = await readBody(request({}, { seasonId: "top14" }), liveRequestSchema);
  assert.equal(result.ok, false);
});

test("validation : du JSON illisible ne passe pas", async () => {
  const req = new Request("https://exemple.test/api/sync/live", {
    method: "POST",
    body: "{ceci n'est pas du JSON",
  });
  const result = await readBody(req, liveRequestSchema);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.message : "", /JSON attendu/);
});

test("validation : la plage du calendrier va par paire et dans l'ordre", async () => {
  const seule = await readBody(request({}, { from: "2026-09-01" }), calendarRequestSchema);
  assert.equal(seule.ok, false);

  const inversee = await readBody(
    request({}, { from: "2026-09-30", to: "2026-09-01" }),
    calendarRequestSchema,
  );
  assert.equal(inversee.ok, false);

  const correcte = await readBody(
    request({}, { from: "2026-09-01", to: "2026-09-30", dryRun: true }),
    calendarRequestSchema,
  );
  assert.equal(correcte.ok, true);
  assert.equal(correcte.ok === true && correcte.value.dryRun, true);
});
