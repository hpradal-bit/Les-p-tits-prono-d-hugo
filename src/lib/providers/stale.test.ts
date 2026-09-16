import { test } from "node:test";
import assert from "node:assert/strict";
import { findStaleFixtures, staleDatesToQuery } from "./schedule.ts";

const SETTINGS = { matchWindowMinutes: 135, lookbackDays: 14 };

function fx(id: string, kickoffAt: string, status: string) {
  return { id, kickoffAt, status };
}

/**
 * Le scénario réel : Bordeaux – Racing, coup d'envoi 19:15 le 5 septembre,
 * une seule remontée à 19:45, puis le fournisseur se tait. Le match sort de sa
 * fenêtre à 21:30 et plus personne ne le redemande.
 */
test("repère un match laissé en live après sa fenêtre", () => {
  const now = new Date("2026-09-08T10:00:00.000Z");
  const stale = findStaleFixtures(
    now,
    [fx("bb-racing", "2026-09-05T19:15:00.000Z", "live")],
    SETTINGS,
  );

  assert.equal(stale.length, 1);
  assert.equal(stale[0].id, "bb-racing");
  assert.equal(stale[0].status, "live");
  // La date interrogée est celle du match, pas celle du jour : c'est tout
  // l'intérêt du rattrapage.
  assert.equal(stale[0].dateKey, "2026-09-05");
});

test("repère aussi un match resté scheduled sans aucun score", () => {
  const now = new Date("2026-09-08T10:00:00.000Z");
  const stale = findStaleFixtures(
    now,
    [fx("jamais-remonte", "2026-09-04T17:30:00.000Z", "scheduled")],
    SETTINGS,
  );
  assert.equal(stale.length, 1);
  assert.equal(stale[0].dateKey, "2026-09-04");
});

test("laisse tranquille un match encore dans sa fenêtre", () => {
  const now = new Date("2026-09-05T20:00:00.000Z"); // 45 min après le coup d'envoi
  const stale = findStaleFixtures(
    now,
    [fx("en-cours", "2026-09-05T19:15:00.000Z", "live")],
    SETTINGS,
  );
  assert.equal(stale.length, 0);
});

test("ignore les statuts dont on ne repart pas", () => {
  const now = new Date("2026-09-08T10:00:00.000Z");
  const stale = findStaleFixtures(
    now,
    [
      fx("a", "2026-09-05T19:15:00.000Z", "official"),
      fx("b", "2026-09-05T19:15:00.000Z", "cancelled"),
      fx("c", "2026-09-05T19:15:00.000Z", "postponed"),
    ],
    SETTINGS,
  );
  assert.equal(stale.length, 0);
});

test("rattrape un match seulement terminé, pas encore officiel", () => {
  const now = new Date("2026-09-08T10:00:00.000Z");
  const stale = findStaleFixtures(
    now,
    [fx("finished-jamais-promu", "2026-08-27T19:00:00.000Z", "finished")],
    SETTINGS,
  );
  assert.equal(stale.length, 1);
});

test("renonce au-delà de la fenêtre de rattrapage", () => {
  const now = new Date("2026-09-30T10:00:00.000Z");
  const stale = findStaleFixtures(
    now,
    [fx("trop-vieux", "2026-09-05T19:15:00.000Z", "live")],
    SETTINGS,
  );
  assert.equal(stale.length, 0);
});

test("à urgence égale, rend les matchs du plus récent au plus ancien", () => {
  const now = new Date("2026-09-14T10:00:00.000Z");
  const stale = findStaleFixtures(
    now,
    [
      { ...fx("vieux", "2026-09-03T19:00:00.000Z", "live"), homeScore: 3 },
      { ...fx("recent", "2026-09-13T19:05:00.000Z", "live"), homeScore: 3 },
      { ...fx("milieu", "2026-09-12T19:00:00.000Z", "live"), homeScore: 3 },
    ],
    SETTINGS,
  );
  assert.deepEqual(stale.map((s) => s.id), ["recent", "milieu", "vieux"]);
});

/**
 * Le défaut trouvé en production le 16 septembre : les matchs qui n'attendaient
 * qu'une officialisation occupaient les deux créneaux de rattrapage par passage,
 * pendant que six matchs Pro D2 sans le moindre score approchaient de
 * l'expiration de la fenêtre. Un match sans données passe désormais devant.
 */
test("un match sans aucun score passe avant un match qui attend son officialisation", () => {
  const now = new Date("2026-09-16T12:00:00.000Z");
  const stale = findStaleFixtures(
    now,
    [
      // Plus récent, mais le score est connu : ce n'est qu'une formalité.
      { ...fx("attend-officialisation", "2026-09-13T19:05:00.000Z", "finished"), homeScore: 48 },
      // Plus ancien, mais les joueurs n'ont aucun point dessus.
      { ...fx("aucune-donnee", "2026-09-04T17:30:00.000Z", "scheduled"), homeScore: null },
    ],
    SETTINGS,
  );
  assert.deepEqual(stale.map((s) => s.id), ["aucune-donnee", "attend-officialisation"]);
});

test("un score figé en direct passe avant une simple officialisation", () => {
  const now = new Date("2026-09-16T12:00:00.000Z");
  const stale = findStaleFixtures(
    now,
    [
      { ...fx("officialisation", "2026-09-15T19:00:00.000Z", "finished"), homeScore: 20 },
      { ...fx("fige-en-direct", "2026-09-14T19:00:00.000Z", "live"), homeScore: 15 },
    ],
    SETTINGS,
  );
  assert.deepEqual(stale.map((s) => s.id), ["fige-en-direct", "officialisation"]);
});

test("compte les minutes écoulées depuis le coup d'envoi", () => {
  const now = new Date("2026-09-05T22:15:00.000Z");
  const stale = findStaleFixtures(
    now,
    [fx("bb-racing", "2026-09-05T19:15:00.000Z", "live")],
    SETTINGS,
  );
  assert.equal(stale[0].elapsedMinutes, 180);
});

test("un match tard le soir reste rattaché à sa date locale", () => {
  // 23:30 à Paris le 5 septembre = 21:30 UTC. La date à interroger est bien
  // le 5, pas le 6 : une erreur ici demanderait au fournisseur le mauvais jour.
  const now = new Date("2026-09-08T10:00:00.000Z");
  const stale = findStaleFixtures(
    now,
    [fx("tard", "2026-09-05T21:30:00.000Z", "live")],
    SETTINGS,
  );
  assert.equal(stale[0].dateKey, "2026-09-05");
});

test("déduplique les dates et respecte le plafond", () => {
  const stale = [
    { id: "a", kickoffAt: "2026-09-13T19:05:00.000Z", status: "live", elapsedMinutes: 100, dateKey: "2026-09-13", urgency: 1 },
    { id: "b", kickoffAt: "2026-09-13T14:35:00.000Z", status: "live", elapsedMinutes: 300, dateKey: "2026-09-13", urgency: 1 },
    { id: "c", kickoffAt: "2026-09-12T19:00:00.000Z", status: "live", elapsedMinutes: 500, dateKey: "2026-09-12", urgency: 1 },
    { id: "d", kickoffAt: "2026-09-04T17:30:00.000Z", status: "scheduled", elapsedMinutes: 900, dateKey: "2026-09-04", urgency: 0 },
  ];

  assert.deepEqual(staleDatesToQuery(stale, 2), ["2026-09-13", "2026-09-12"]);
  assert.deepEqual(staleDatesToQuery(stale, 10), ["2026-09-13", "2026-09-12", "2026-09-04"]);
  assert.deepEqual(staleDatesToQuery(stale, 0), []);
});
