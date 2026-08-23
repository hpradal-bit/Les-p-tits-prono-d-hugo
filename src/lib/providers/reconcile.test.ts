import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findRoundFor,
  planCalendarUpdate,
  planLiveUpdate,
  planMissingRounds,
  type StoredFixture,
  type StoredRound,
} from "./reconcile.ts";
import type { ProviderFixture } from "./types.ts";

/**
 * Un match de la phase aller tel que la migration 0005 l'a créé : coup d'envoi
 * provisoire au samedi 15 h (heure de Paris), horaire non confirmé, verrouillage
 * deux heures avant.
 */
function provisional(overrides: Partial<StoredFixture> = {}): StoredFixture {
  return {
    id: "f-1",
    roundId: "r-1",
    homeTeamId: "t-st",
    awayTeamId: "t-asm",
    kickoffAt: "2026-09-05T13:00:00.000Z", // 15 h à Paris
    kickoffConfirmed: false,
    locksAt: "2026-09-05T11:00:00.000Z",
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    minute: null,
    venue: null,
    dataSource: null,
    ...overrides,
  };
}

function incoming(overrides: Partial<ProviderFixture> = {}): ProviderFixture {
  return {
    externalId: "600123",
    kickoffAt: "2026-09-05T19:05:00.000Z", // 21 h 05 à Paris
    kickoffPrecise: true,
    status: "scheduled",
    homeTeam: { externalId: "1001", name: "Stade Toulousain", aliases: [] },
    awayTeam: { externalId: "1002", name: "ASM Clermont Auvergne", aliases: [] },
    homeScore: null,
    awayScore: null,
    minute: null,
    venue: null,
    roundLabel: null,
    ...overrides,
  };
}

// --- Confirmation des horaires : la priorité du chantier --------------------

test("calendrier : la LNR publie l'horaire → coup d'envoi, drapeau et verrou changent ensemble", () => {
  const { patch, reasons } = planCalendarUpdate(provisional(), incoming(), {
    lockMinutes: 120,
    provider: "espn",
  });

  assert.equal(patch.kickoff_at, "2026-09-05T19:05:00.000Z");
  assert.equal(patch.kickoff_confirmed, true);
  assert.equal(patch.locks_at, "2026-09-05T17:05:00.000Z");
  assert.equal(patch.data_source, "espn");
  assert.ok(patch.last_synced_at);
  assert.equal(reasons.length, 3);
});

test("calendrier : le verrouillage suit le délai du barème, quel qu'il soit", () => {
  for (const [minutes, expected] of [
    [15, "2026-09-05T18:50:00.000Z"],
    [60, "2026-09-05T18:05:00.000Z"],
    [1440, "2026-09-04T19:05:00.000Z"],
  ] as const) {
    const { patch } = planCalendarUpdate(provisional(), incoming(), {
      lockMinutes: minutes,
      provider: "espn",
    });
    assert.equal(patch.locks_at, expected, `délai de ${minutes} min`);
  }
});

test("calendrier : un horaire déjà confirmé et inchangé ne produit aucune écriture", () => {
  const existing = provisional({
    kickoffAt: "2026-09-05T19:05:00.000Z",
    kickoffConfirmed: true,
    locksAt: "2026-09-05T17:05:00.000Z",
  });
  const { patch } = planCalendarUpdate(existing, incoming(), {
    lockMinutes: 120,
    provider: "espn",
  });
  assert.deepEqual(patch, {});
});

test("calendrier : un match décalé d'une semaine est repris, verrou compris", () => {
  const existing = provisional({
    kickoffAt: "2026-09-05T19:05:00.000Z",
    kickoffConfirmed: true,
    locksAt: "2026-09-05T17:05:00.000Z",
  });
  const { patch } = planCalendarUpdate(
    existing,
    incoming({ kickoffAt: "2026-09-12T19:05:00.000Z" }),
    { lockMinutes: 120, provider: "espn" },
  );
  assert.equal(patch.kickoff_at, "2026-09-12T19:05:00.000Z");
  assert.equal(patch.locks_at, "2026-09-12T17:05:00.000Z");
});

test("calendrier : le délai de verrouillage a changé en admin → locks_at est rattrapé", () => {
  const existing = provisional({
    kickoffAt: "2026-09-05T19:05:00.000Z",
    kickoffConfirmed: true,
    locksAt: "2026-09-05T17:05:00.000Z", // calculé avec 120 min
  });
  const { patch } = planCalendarUpdate(existing, incoming(), {
    lockMinutes: 180,
    provider: "espn",
  });
  assert.equal(patch.locks_at, "2026-09-05T16:05:00.000Z");
  assert.equal(patch.kickoff_at, undefined); // l'horaire, lui, n'a pas bougé
});

test("calendrier : sans horaire précis, l'horaire reste provisoire", () => {
  const { patch, reasons } = planCalendarUpdate(
    provisional(),
    incoming({ kickoffPrecise: false, kickoffAt: "2026-09-05T00:00:00.000Z" }),
    { lockMinutes: 120, provider: "espn" },
  );
  assert.deepEqual(patch, {});
  assert.match(reasons[0], /pas encore d'horaire précis/);
});

test("calendrier : un horaire fixé à la main par l'admin n'est pas écrasé", () => {
  const existing = provisional({
    kickoffAt: "2026-09-05T18:00:00.000Z",
    kickoffConfirmed: true,
    locksAt: "2026-09-05T16:00:00.000Z",
    dataSource: "manual",
  });
  const { patch, reasons } = planCalendarUpdate(existing, incoming(), {
    lockMinutes: 120,
    provider: "espn",
  });
  assert.deepEqual(patch, {});
  assert.match(reasons[0], /fixé par l'admin/);
});

test("calendrier : l'admin peut être écrasé si on le demande explicitement", () => {
  const existing = provisional({
    kickoffAt: "2026-09-05T18:00:00.000Z",
    kickoffConfirmed: true,
    locksAt: "2026-09-05T16:00:00.000Z",
    dataSource: "manual",
  });
  const { patch } = planCalendarUpdate(existing, incoming(), {
    lockMinutes: 120,
    provider: "espn",
    respectManualOverrides: false,
  });
  assert.equal(patch.kickoff_at, "2026-09-05T19:05:00.000Z");
  assert.equal(patch.locks_at, "2026-09-05T17:05:00.000Z");
});

test("calendrier : un report passe, un stade manquant se remplit", () => {
  const { patch } = planCalendarUpdate(
    provisional({ kickoffConfirmed: true, kickoffAt: "2026-09-05T19:05:00.000Z", locksAt: "2026-09-05T17:05:00.000Z" }),
    incoming({ status: "postponed", venue: "Stade Ernest-Wallon" }),
    { lockMinutes: 120, provider: "espn" },
  );
  assert.equal(patch.status, "postponed");
  assert.equal(patch.venue, "Stade Ernest-Wallon");
});

// --- Scores en direct --------------------------------------------------------

test("direct : le score et le statut sont repris", () => {
  const { patch } = planLiveUpdate(
    provisional({ status: "scheduled" }),
    incoming({ status: "live", homeScore: 17, awayScore: 12, minute: 53 }),
    { provider: "espn", officialAfterMinutes: 180, now: new Date("2026-09-05T14:00:00Z") },
  );
  assert.equal(patch.home_score, 17);
  assert.equal(patch.away_score, 12);
  assert.equal(patch.status, "live");
  assert.equal(patch.minute, 53);
});

test("direct : un résultat officiel est intouchable par la synchro", () => {
  const { patch, reasons } = planLiveUpdate(
    provisional({ status: "official", homeScore: 27, awayScore: 27 }),
    incoming({ status: "finished", homeScore: 30, awayScore: 27 }),
    { provider: "espn", officialAfterMinutes: 180 },
  );
  assert.deepEqual(patch, {});
  assert.match(reasons[0], /officiel/);
});

test("direct : un fournisseur amnésique n'efface pas un score connu", () => {
  const { patch } = planLiveUpdate(
    provisional({ status: "live", homeScore: 17, awayScore: 12 }),
    incoming({ status: "live", homeScore: null, awayScore: null }),
    { provider: "espn", officialAfterMinutes: 180 },
  );
  assert.equal(patch.home_score, undefined);
  assert.equal(patch.away_score, undefined);
});

test("direct : on ne redescend jamais d'un statut plus ferme", () => {
  const { patch } = planLiveUpdate(
    provisional({ status: "finished", homeScore: 27, awayScore: 27 }),
    incoming({ status: "scheduled", homeScore: 27, awayScore: 27 }),
    { provider: "espn", officialAfterMinutes: 180, now: new Date("2026-09-05T13:30:00Z") },
  );
  assert.equal(patch.status, undefined);
});

test("direct : un score terminé et stable devient officiel après le délai réglé", () => {
  const existing = provisional({
    kickoffAt: "2026-09-05T12:30:00.000Z",
    status: "finished",
    homeScore: 27,
    awayScore: 27,
  });
  const sameScore = incoming({ status: "finished", homeScore: 27, awayScore: 27 });

  // Une heure après le coup d'envoi : trop tôt.
  const early = planLiveUpdate(existing, sameScore, {
    provider: "espn",
    officialAfterMinutes: 180,
    now: new Date("2026-09-05T13:30:00.000Z"),
  });
  assert.deepEqual(early.patch, {});

  // Quatre heures après : le résultat est figé.
  const late = planLiveUpdate(existing, sameScore, {
    provider: "espn",
    officialAfterMinutes: 180,
    now: new Date("2026-09-05T16:30:00.000Z"),
  });
  assert.equal(late.patch.status, "official");
});

test("direct : un score corrigé après coup repousse le passage à officiel", () => {
  const existing = provisional({
    kickoffAt: "2026-09-05T12:30:00.000Z",
    status: "finished",
    homeScore: 27,
    awayScore: 27,
  });
  const { patch } = planLiveUpdate(
    existing,
    incoming({ status: "finished", homeScore: 27, awayScore: 24 }),
    { provider: "espn", officialAfterMinutes: 180, now: new Date("2026-09-05T16:30:00.000Z") },
  );
  assert.equal(patch.away_score, 24);
  assert.equal(patch.status, undefined, "on attend un cycle de plus avant de figer");
});

// --- Rattachement aux journées et phase retour -------------------------------

const rounds: StoredRound[] = [
  {
    id: "r-1",
    number: 1,
    name: "J1",
    startsAt: "2026-09-04T22:00:00.000Z",
    endsAt: "2026-09-06T21:59:00.000Z",
  },
  {
    id: "r-13",
    number: 13,
    name: "J13 · Boxing Day",
    startsAt: "2026-12-25T23:00:00.000Z",
    endsAt: "2026-12-27T22:59:00.000Z",
  },
];

test("journée : un match tombe dans la fenêtre déclarée", () => {
  assert.equal(findRoundFor("2026-09-05T19:05:00.000Z", rounds)?.id, "r-1");
  assert.equal(findRoundFor("2026-12-26T14:00:00.000Z", rounds)?.id, "r-13");
});

test("journée : à défaut de fenêtre, le week-end tranche", () => {
  const loose: StoredRound[] = [
    { id: "r-x", number: 5, name: "J5", startsAt: "2026-10-03T13:00:00.000Z", endsAt: null },
  ];
  assert.equal(findRoundFor("2026-10-04T14:00:00.000Z", loose)?.id, "r-x");
  assert.equal(findRoundFor("2026-10-17T14:00:00.000Z", loose), null);
});

test("phase retour : les journées J14 à J26 se créent d'elles-mêmes", () => {
  // La LNR publie la phase retour : treize week-ends inconnus au calendrier.
  const kickoffs: string[] = [];
  for (let week = 0; week < 13; week += 1) {
    const saturday = new Date(Date.UTC(2027, 0, 9) + week * 7 * 86_400_000);
    kickoffs.push(new Date(saturday.getTime() + 14 * 3_600_000).toISOString());
    kickoffs.push(new Date(saturday.getTime() + 20 * 3_600_000).toISOString());
  }

  const existing = Array.from({ length: 13 }, (_, i) => ({
    id: `r-${i + 1}`,
    number: i + 1,
    name: `J${i + 1}`,
    startsAt: new Date(Date.UTC(2026, 8, 5) + i * 7 * 86_400_000).toISOString(),
    endsAt: null,
  }));

  const planned = planMissingRounds(kickoffs, existing, { maxRounds: 26 });
  assert.equal(planned.length, 13);
  assert.equal(planned[0].number, 14);
  assert.equal(planned[0].name, "J14");
  assert.equal(planned[12].number, 26);
  // Les deux matchs d'un même week-end tiennent dans la même journée.
  assert.ok(planned[0].startsAt < kickoffs[0]);
  assert.ok(planned[0].endsAt > kickoffs[1]);
});

test("phase retour : jamais de J27, le garde-fou tient", () => {
  const kickoffs = Array.from({ length: 5 }, (_, i) =>
    new Date(Date.UTC(2027, 3, 3) + i * 7 * 86_400_000 + 14 * 3_600_000).toISOString(),
  );
  const existing = Array.from({ length: 25 }, (_, i) => ({
    id: `r-${i + 1}`,
    number: i + 1,
    name: `J${i + 1}`,
    startsAt: new Date(Date.UTC(2026, 8, 5) + i * 7 * 86_400_000).toISOString(),
    endsAt: null,
  }));

  const planned = planMissingRounds(kickoffs, existing, { maxRounds: 26 });
  assert.equal(planned.length, 1);
  assert.equal(planned[0].number, 26);
});

test("phase retour : un week-end déjà connu ne crée pas de doublon", () => {
  const planned = planMissingRounds(
    ["2026-09-05T19:05:00.000Z", "2026-09-06T13:00:00.000Z"],
    rounds,
    { maxRounds: 26 },
  );
  assert.deepEqual(planned, []);
});
