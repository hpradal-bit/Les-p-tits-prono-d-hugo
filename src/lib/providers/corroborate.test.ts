import { test } from "node:test";
import assert from "node:assert/strict";
import { corroborateScore, planLiveUpdate, type StoredFixture } from "./reconcile.ts";
import type { ProviderFixture } from "./types.ts";

function stored(over: Partial<StoredFixture> = {}): StoredFixture {
  return {
    id: "fix-1",
    roundId: "r-1",
    homeTeamId: "home",
    awayTeamId: "away",
    kickoffAt: "2026-09-05T19:15:00.000Z",
    kickoffConfirmed: true,
    locksAt: "2026-09-05T17:15:00.000Z",
    status: "finished",
    homeScore: 19,
    awayScore: 0,
    minute: null,
    venue: null,
    dataSource: "thesportsdb",
    ...over,
  };
}

function incoming(over: Partial<ProviderFixture> = {}): ProviderFixture {
  return {
    externalId: "ext-1",
    homeTeam: { name: "Bordeaux-Bègles" },
    awayTeam: { name: "Racing 92" },
    kickoffAt: "2026-09-05T19:15:00.000Z",
    kickoffPrecise: true,
    status: "finished",
    homeScore: 19,
    awayScore: 0,
    minute: null,
    venue: null,
    ...over,
  } as ProviderFixture;
}

// --- La comparaison elle-même -----------------------------------------------

test("deux fournisseurs d'accord : score confirmé", () => {
  const r = corroborateScore(
    { provider: "thesportsdb", homeScore: 24, awayScore: 19 },
    { provider: "espn", homeScore: 24, awayScore: 19 },
  );
  assert.equal(r.verdict, "confirmed");
  assert.match(r.detail, /concordent/);
});

test("deux fournisseurs en désaccord : conflit signalé avec les deux versions", () => {
  const r = corroborateScore(
    { provider: "thesportsdb", homeScore: 19, awayScore: 0 },
    { provider: "espn", homeScore: 33, awayScore: 7 },
  );
  assert.equal(r.verdict, "conflicting");
  assert.match(r.detail, /thesportsdb annonce 19-0/);
  assert.match(r.detail, /espn annonce 33-7/);
});

test("pas de second avis : indisponible, et non un conflit", () => {
  const r = corroborateScore({ provider: "thesportsdb", homeScore: 19, awayScore: 0 }, null);
  assert.equal(r.verdict, "unavailable");
});

test("second fournisseur sans score : indisponible", () => {
  const r = corroborateScore(
    { provider: "thesportsdb", homeScore: 19, awayScore: 0 },
    { provider: "espn", homeScore: null, awayScore: null },
  );
  assert.equal(r.verdict, "unavailable");
});

test("un 0-0 réel n'est pas confondu avec une absence de score", () => {
  const r = corroborateScore(
    { provider: "thesportsdb", homeScore: 0, awayScore: 0 },
    { provider: "espn", homeScore: 0, awayScore: 0 },
  );
  assert.equal(r.verdict, "confirmed");
});

// --- Le garde-fou sur le passage en officiel --------------------------------

test("un score confirmé passe en officiel", () => {
  const plan = planLiveUpdate(stored(), incoming(), {
    provider: "thesportsdb",
    now: new Date("2026-09-05T22:20:00.000Z"), // 185 min après le coup d'envoi
    officialAfterMinutes: 180,
    corroboration: "confirmed",
  });
  assert.equal(plan.patch.status, "official");
});

test("un score contredit ne passe PAS en officiel", () => {
  // Le cœur du correctif : sans ça, le 19-0 figé de Bordeaux – Racing était
  // gravé définitivement, hors d'atteinte de la synchro.
  const plan = planLiveUpdate(stored(), incoming(), {
    provider: "thesportsdb",
    now: new Date("2026-09-05T22:20:00.000Z"),
    officialAfterMinutes: 180,
    corroboration: "conflicting",
  });
  assert.notEqual(plan.patch.status, "official");
  assert.ok(plan.reasons.some((r) => r.includes("suspendu")));
});

test("sans second avis disponible, on n'immobilise pas le championnat", () => {
  // Un fournisseur muet ne doit pas empêcher un résultat d'être officialisé :
  // sinon une panne chez ESPN bloquerait toute la saison.
  const plan = planLiveUpdate(stored(), incoming(), {
    provider: "thesportsdb",
    now: new Date("2026-09-05T22:20:00.000Z"),
    officialAfterMinutes: 180,
    corroboration: "unavailable",
  });
  assert.equal(plan.patch.status, "official");
});

test("deferOfficial laisse la décision à la passe de recoupement", () => {
  const plan = planLiveUpdate(stored(), incoming(), {
    provider: "thesportsdb",
    now: new Date("2026-09-05T22:20:00.000Z"),
    officialAfterMinutes: 180,
    deferOfficial: true,
  });
  assert.notEqual(plan.patch.status, "official");
  assert.ok(plan.reasons.some((r) => r.includes("différé")));
});

test("sans option de recoupement, le comportement d'origine est inchangé", () => {
  const plan = planLiveUpdate(stored(), incoming(), {
    provider: "thesportsdb",
    now: new Date("2026-09-05T22:20:00.000Z"),
    officialAfterMinutes: 180,
  });
  assert.equal(plan.patch.status, "official");
});

test("le recoupement n'intervient pas avant le délai d'officialisation", () => {
  const plan = planLiveUpdate(stored(), incoming(), {
    provider: "thesportsdb",
    now: new Date("2026-09-05T20:00:00.000Z"), // 45 min après le coup d'envoi
    officialAfterMinutes: 180,
    corroboration: "conflicting",
  });
  assert.equal(plan.patch.status, undefined);
});
