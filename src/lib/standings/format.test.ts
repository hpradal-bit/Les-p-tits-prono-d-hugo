import { test } from "node:test";
import assert from "node:assert/strict";
import { isInProgress, lastSyncedLabel, liveBadgeLabel } from "./format.ts";

test("isInProgress : live et halftime comptent, le reste non", () => {
  assert.equal(isInProgress("live"), true);
  assert.equal(isInProgress("halftime"), true);
  assert.equal(isInProgress("scheduled"), false);
  assert.equal(isInProgress("finished"), false);
  assert.equal(isInProgress("official"), false);
  assert.equal(isInProgress("postponed"), false);
  assert.equal(isInProgress("cancelled"), false);
});

test("liveBadgeLabel : la mi-temps prime sur la minute", () => {
  assert.equal(liveBadgeLabel("halftime", 40), "MI-TEMPS");
  assert.equal(liveBadgeLabel("halftime", null), "MI-TEMPS");
});

test("liveBadgeLabel : le direct affiche la minute, ou LIVE à défaut", () => {
  assert.equal(liveBadgeLabel("live", 34), "34'");
  assert.equal(liveBadgeLabel("live", null), "LIVE");
  assert.equal(liveBadgeLabel("live", 0), "LIVE");
});

test("lastSyncedLabel : secondes, minutes, puis heures d'ancienneté", () => {
  const base = new Date("2026-09-20T18:00:00.000Z").getTime();
  assert.equal(lastSyncedLabel(new Date(base - 2_000).toISOString(), base), "à l'instant");
  assert.equal(lastSyncedLabel(new Date(base - 12_000).toISOString(), base), "il y a 12 s");
  assert.equal(lastSyncedLabel(new Date(base - 4 * 60_000).toISOString(), base), "il y a 4 min");
  assert.equal(
    lastSyncedLabel(new Date(base - 70 * 60_000).toISOString(), base),
    "à 16h50",
  );
  assert.equal(lastSyncedLabel(new Date(base - 5 * 3_600_000).toISOString(), base), "il y a 5 h");
});
