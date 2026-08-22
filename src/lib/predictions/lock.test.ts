import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatCountdown,
  formatKickoff,
  isLockedAt,
  lockSentence,
  msUntil,
  nextLockAt,
} from "./lock.ts";

const T0 = Date.parse("2026-09-05T10:00:00Z");

test("msUntil compte à partir de l'instant fourni, jamais de l'horloge locale", () => {
  assert.equal(msUntil("2026-09-05T11:00:00Z", T0), 3_600_000);
  assert.equal(msUntil("2026-09-05T09:00:00Z", T0), -3_600_000);
});

test("un match est verrouillé dès l'instant exact de locks_at", () => {
  assert.equal(isLockedAt("2026-09-05T10:00:00Z", T0), true);
  assert.equal(isLockedAt("2026-09-05T10:00:01Z", T0), false);
  assert.equal(isLockedAt("2026-09-05T09:59:59Z", T0), true);
});

test("nextLockAt ignore les verrouillages déjà passés", () => {
  const locks = [
    "2026-09-05T09:00:00Z", // passé
    "2026-09-05T13:00:00Z",
    "2026-09-05T11:30:00Z",
  ];
  assert.equal(nextLockAt(locks, T0), "2026-09-05T11:30:00Z");
  assert.equal(nextLockAt(["2026-09-05T08:00:00Z"], T0), null);
  assert.equal(nextLockAt([], T0), null);
});

test("le compte à rebours se lit d'un coup d'œil", () => {
  assert.equal(formatCountdown(-1), "verrouillé");
  assert.equal(formatCountdown(0), "verrouillé");
  assert.equal(formatCountdown(30_000), "30 s");
  assert.equal(formatCountdown(12 * 60_000 + 5_000), "12 min 05");
  assert.equal(formatCountdown(3 * 3_600_000 + 5 * 60_000), "3 h 05");
  assert.equal(formatCountdown(2 * 86_400_000 + 4 * 3_600_000), "2 j 4 h");
  assert.equal(formatCountdown(3 * 86_400_000), "3 j");
});

test("lockSentence dit la même chose en français", () => {
  assert.equal(lockSentence("2026-09-05T13:00:00Z", T0), "ferme dans 3 h 00");
  assert.equal(lockSentence("2026-09-05T09:00:00Z", T0), "fermé");
});

test("l'horaire s'affiche dans le fuseau du jeu", () => {
  // 13 h UTC = 15 h à Paris en septembre.
  const paris = formatKickoff("2026-09-05T13:00:00Z", "Europe/Paris");
  assert.match(paris, /15:00$/);
  assert.match(paris, /^sam\./);

  const utc = formatKickoff("2026-09-05T13:00:00Z", "UTC");
  assert.match(utc, /13:00$/);
});
