import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compactDate,
  computeLocksAt,
  evaluateWindow,
  groupByWeekend,
  localDateKey,
  rangeAround,
  weekendAnchor,
} from "./schedule.ts";

// --- Verrouillage ------------------------------------------------------------

test("verrouillage : deux heures avant le coup d'envoi", () => {
  assert.equal(computeLocksAt("2026-09-05T19:05:00.000Z", 120), "2026-09-05T17:05:00.000Z");
});

test("verrouillage : le délai vient du barème, pas d'une constante", () => {
  const kickoff = "2026-09-05T19:05:00.000Z";
  assert.equal(computeLocksAt(kickoff, 15), "2026-09-05T18:50:00.000Z");
  assert.equal(computeLocksAt(kickoff, 1440), "2026-09-04T19:05:00.000Z");
  assert.equal(computeLocksAt(kickoff, 0), kickoff);
});

test("verrouillage : une date illisible lève, elle ne produit pas de NaN", () => {
  assert.throws(() => computeLocksAt("bientôt", 120), /illisible/);
  // Un délai absurde ne verrouille pas après le coup d'envoi.
  assert.equal(computeLocksAt("2026-09-05T19:05:00.000Z", -60), "2026-09-05T19:05:00.000Z");
});

// --- Dates locales -----------------------------------------------------------

test("date locale : un match du samedi 23 h à Paris reste un samedi", () => {
  // 2026-09-05T21:00Z = dimanche 6 septembre 23 h ? Non : samedi 23 h à Paris.
  assert.equal(localDateKey("2026-09-05T21:00:00.000Z"), "2026-09-05");
  // 22 h 30 UTC un samedi = dimanche 0 h 30 à Paris.
  assert.equal(localDateKey("2026-09-05T22:30:00.000Z"), "2026-09-06");
});

test("format compact : AAAA-MM-JJ → AAAAMMJJ", () => {
  assert.equal(compactDate("2026-09-05"), "20260905");
});

test("plage : marge avant et après une date", () => {
  assert.deepEqual(rangeAround("2026-09-05", 1, 2), { from: "2026-09-04", to: "2026-09-07" });
});

// --- Regroupement en journées ------------------------------------------------

test("week-end : jeudi à dimanche appartiennent à la même journée", () => {
  const samedi = "2026-09-05";
  assert.equal(weekendAnchor("2026-09-03T19:00:00.000Z"), samedi); // jeudi
  assert.equal(weekendAnchor("2026-09-04T19:00:00.000Z"), samedi); // vendredi
  assert.equal(weekendAnchor("2026-09-05T13:00:00.000Z"), samedi); // samedi
  assert.equal(weekendAnchor("2026-09-06T19:00:00.000Z"), samedi); // dimanche
});

test("week-end : un match décalé au lundi reste rattaché au week-end passé", () => {
  assert.equal(weekendAnchor("2026-09-07T19:00:00.000Z"), "2026-09-05");
});

test("week-end : deux week-ends consécutifs ne se mélangent pas", () => {
  const groups = groupByWeekend(
    [
      "2026-09-12T13:00:00.000Z",
      "2026-09-05T13:00:00.000Z",
      "2026-09-06T13:00:00.000Z",
      "2026-09-11T19:00:00.000Z",
    ],
    (k) => k,
  );
  assert.equal(groups.length, 2);
  assert.equal(groups[0].anchor, "2026-09-05");
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[1].anchor, "2026-09-12");
  assert.equal(groups[1].items.length, 2);
});

// --- Fenêtres de match : le nerf du quota -----------------------------------

const settings = {
  liveIntervalMinutes: 5,
  idleIntervalMinutes: 60,
  matchWindowMinutes: 135,
};

test("fenêtre : un mardi sans match, on repasse dans une heure", () => {
  const now = new Date("2026-11-17T10:00:00.000Z");
  const verdict = evaluateWindow(
    now,
    [{ kickoffAt: "2026-11-21T14:30:00.000Z", status: "scheduled" }],
    settings,
  );
  assert.equal(verdict.inWindow, false);
  assert.equal(verdict.nextCheckAt, "2026-11-17T11:00:00.000Z");
});

test("fenêtre : pendant un match, on repasse dans cinq minutes", () => {
  const now = new Date("2026-09-05T13:30:00.000Z");
  const verdict = evaluateWindow(
    now,
    [{ kickoffAt: "2026-09-05T12:30:00.000Z", status: "live" }],
    settings,
  );
  assert.equal(verdict.inWindow, true);
  assert.equal(verdict.nextCheckAt, "2026-09-05T13:35:00.000Z");
  assert.equal(verdict.activeKickoffs.length, 1);
});

test("fenêtre : elle s'ouvre juste avant le coup d'envoi", () => {
  const kickoff = "2026-09-05T19:05:00.000Z";
  const fixtures = [{ kickoffAt: kickoff, status: "scheduled" }];
  assert.equal(evaluateWindow(new Date("2026-09-05T18:55:00Z"), fixtures, settings).inWindow, false);
  assert.equal(evaluateWindow(new Date("2026-09-05T19:01:00Z"), fixtures, settings).inWindow, true);
});

test("fenêtre : elle se referme 2 h 15 après le coup d'envoi", () => {
  const fixtures = [{ kickoffAt: "2026-09-05T12:30:00.000Z", status: "finished" }];
  assert.equal(evaluateWindow(new Date("2026-09-05T14:44:00Z"), fixtures, settings).inWindow, true);
  assert.equal(evaluateWindow(new Date("2026-09-05T14:46:00Z"), fixtures, settings).inWindow, false);
});

test("fenêtre : un résultat officiel ne rouvre pas de fenêtre", () => {
  const now = new Date("2026-09-05T13:30:00.000Z");
  const verdict = evaluateWindow(
    now,
    [{ kickoffAt: "2026-09-05T12:30:00.000Z", status: "official" }],
    settings,
  );
  assert.equal(verdict.inWindow, false);
});

test("fenêtre : un match annulé est ignoré", () => {
  const verdict = evaluateWindow(
    new Date("2026-09-05T13:30:00.000Z"),
    [{ kickoffAt: "2026-09-05T12:30:00.000Z", status: "cancelled" }],
    settings,
  );
  assert.equal(verdict.inWindow, false);
});

test("fenêtre : on ne dort jamais au-delà du prochain coup d'envoi", () => {
  // Prochain match dans 20 minutes : inutile d'attendre une heure.
  const now = new Date("2026-09-05T12:00:00.000Z");
  const verdict = evaluateWindow(
    now,
    [{ kickoffAt: "2026-09-05T12:20:00.000Z", status: "scheduled" }],
    settings,
  );
  assert.equal(verdict.inWindow, false);
  assert.equal(verdict.nextCheckAt, "2026-09-05T12:15:00.000Z");
});

test("fenêtre : un samedi de Top 14 tient dans le quota de 100 requêtes", () => {
  // Deux créneaux, comme dans l'audit : 14 h 30 et 21 h 05 (heure de Paris).
  const fixtures = [
    { kickoffAt: "2026-09-05T12:30:00.000Z", status: "scheduled" },
    { kickoffAt: "2026-09-05T19:05:00.000Z", status: "scheduled" },
  ];

  let now = new Date("2026-09-05T00:00:00.000Z");
  const end = new Date("2026-09-06T00:00:00.000Z");
  let calls = 0;

  // On rejoue une journée entière en suivant les consignes du planificateur.
  while (now < end && calls < 500) {
    const verdict = evaluateWindow(now, fixtures, settings);
    calls += 1;
    now = new Date(verdict.nextCheckAt);
  }

  // ~18 passages horaires + 2 fenêtres de 27 passages : on reste sous 100.
  assert.ok(calls < 100, `attendu moins de 100 appels, obtenu ${calls}`);
  assert.ok(calls > 40, `attendu un suivi réel du direct, obtenu ${calls}`);
});
