import { test } from "node:test";
import assert from "node:assert/strict";
import { isPowerPublic, keepPublicPowers } from "./visibility.ts";

const NOW = new Date("2026-09-19T21:00:00Z");

test("un pouvoir reste secret avant le coup d'envoi", () => {
  assert.equal(isPowerPublic("2026-09-19T21:05:00Z", NOW), false);
});

test("le coup d'envoi passé, il devient public", () => {
  assert.equal(isPowerPublic("2026-09-19T20:00:00Z", NOW), true);
});

test("à la seconde exacte du coup d'envoi, il est public", () => {
  assert.equal(isPowerPublic("2026-09-19T21:00:00Z", NOW), true);
});

test("un pouvoir sans match connu n'est pas caché pour toujours", () => {
  assert.equal(isPowerPublic(null, NOW), true);
  assert.equal(isPowerPublic(undefined, NOW), true);
});

test("une date illisible ne fait pas disparaître le pouvoir en silence", () => {
  assert.equal(isPowerPublic("samedi prochain", NOW), true);
});

test("le filtre ne garde que les matchs commencés", () => {
  const items = [
    { id: "a", kickoff: "2026-09-19T18:00:00Z" },
    { id: "b", kickoff: "2026-09-19T21:30:00Z" },
    { id: "c", kickoff: null },
  ];
  assert.deepEqual(
    keepPublicPowers(items, (i) => i.kickoff, NOW).map((i) => i.id),
    ["a", "c"],
  );
});
