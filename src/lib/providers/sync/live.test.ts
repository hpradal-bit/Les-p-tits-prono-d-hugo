import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { syncLive } from "./live.ts";
import { fakeSupabase } from "./fake-supabase.ts";
import type { SyncContext } from "./context.ts";
import type { ProviderFixture, SportsDataProvider } from "../types.ts";

/**
 * Le chemin qui n'avait jamais été éprouvé : un match se termine, et les points
 * tombent.
 *
 * Il manquait un maillon, et rien ne le signalait. Le relevé écrivait le score,
 * émettait son événement, renvoyait un rapport en succès — mais n'appelait
 * jamais le calcul des points. La panne ne se serait vue qu'un samedi soir de
 * septembre : scores affichés, classement à zéro, et personne pour comprendre
 * pourquoi. Les tests des fonctions pures ne pouvaient pas l'attraper : le
 * défaut n'était pas dans un calcul, il était dans un appel absent.
 */

const SEASON = "s1";
const KICKOFF = "2026-09-05T19:05:00.000Z";
/** Pendant la fenêtre du match : 20 minutes après le coup d'envoi. */
const NOW = new Date("2026-09-05T19:25:00.000Z");

function providerFixture(over: Partial<ProviderFixture> = {}): ProviderFixture {
  return {
    externalId: "ext-1",
    kickoffAt: KICKOFF,
    kickoffPrecise: true,
    status: "finished",
    homeTeam: { externalId: "e-home", name: "Stade Toulousain", aliases: [] },
    awayTeam: { externalId: "e-away", name: "ASM Clermont", aliases: [] },
    homeScore: 24,
    awayScore: 12,
    ...over,
  } as ProviderFixture;
}

function provider(fixtures: ProviderFixture[]): SportsDataProvider {
  return {
    name: "espn",
    dailyQuota: null,
    getFixtures: async () => ({ provider: "espn", data: [], requestsUsed: 1, warnings: [] }),
    getLiveScores: async () => ({ provider: "espn", data: fixtures, requestsUsed: 1, warnings: [] }),
    getStandings: async () => ({ provider: "espn", data: [], requestsUsed: 1, warnings: [] }),
  };
}

/** Une base contenant un match en cours, prêt à se terminer. */
function seed(status = "live") {
  return {
    seasons: [{ id: SEASON, label: "2026/2027", competition_id: "c1", starts_on: "2026-09-01", status: "active" }],
    rounds: [{ id: "r1", season_id: SEASON, number: 1, name: "J1" }],
    fixtures: [{
      id: "f1", round_id: "r1", season_id: SEASON,
      home_team_id: "t-home", away_team_id: "t-away",
      kickoff_at: KICKOFF, kickoff_confirmed: true, locks_at: "2026-09-05T17:05:00.000Z",
      status, home_score: null, away_score: null, minute: null,
      venue: null, data_source: "espn", updated_at: null, last_synced_at: null,
    }],
    // Sans référence de saison, aucun fournisseur n'est interrogeable.
    external_refs: [
      { provider: "espn", entity_type: "season", entity_id: SEASON, external_id: "270559" },
    ],
    sync_runs: [],
    events: [],
  };
}

function context(sb: unknown, fixtures: ProviderFixture[]): SyncContext {
  const chain = { providers: [provider(fixtures)], skipped: [] };
  return {
    sb,
    season: { id: SEASON, label: "2026/2027", competitionId: "c1", startsOn: "2026-09-01", endsOn: null },
    settings: [],
    teams: [
      { id: "t-home", name: "Stade Toulousain", shortName: "Toulouse", code: "ST" },
      { id: "t-away", name: "ASM Clermont", shortName: "Clermont", code: "ASM" },
    ],
    aliases: {},
    chain,
    chainFor: () => chain,
    lockMinutes: 120,
    apisportsUsedToday: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("un match qui se termine distribue ses points", () => {
  test("le calcul des points est déclenché sur le match terminé", async () => {
    const { client } = fakeSupabase(seed());
    const scored: string[][] = [];

    const report = await syncLive(context(client, [providerFixture()]), {
      now: NOW,
      date: "2026-09-05",
      recompute: async (_sb, ids) => {
        scored.push(ids);
        return { fixtures: ids.length, predictions: 6 };
      },
    });

    assert.equal(report.status, "success");
    assert.deepEqual(report.finished, ["f1"], "le match doit être reconnu comme terminé");
    assert.deepEqual(scored, [["f1"]], "le calcul des points doit porter sur ce match");
    assert.equal(report.predictionsScored, 6, "le rapport doit dire combien de pronostics ont été notés");
  });

  test("le score est bien écrit en base", async () => {
    const fake = fakeSupabase(seed());
    await syncLive(context(fake.client, [providerFixture()]), {
      now: NOW, date: "2026-09-05",
      recompute: async () => ({ fixtures: 1, predictions: 0 }),
    });

    const fixture = fake.db.fixtures[0];
    assert.equal(fixture.home_score, 24);
    assert.equal(fixture.away_score, 12);
  });

  test("l'événement de fin de match est émis", async () => {
    // Le fil social, les badges et les notifications lisent ce flux ; ils ne
    // recalculent jamais la logique de leur côté.
    const fake = fakeSupabase(seed());
    await syncLive(context(fake.client, [providerFixture()]), {
      now: NOW, date: "2026-09-05",
      recompute: async () => ({ fixtures: 1, predictions: 0 }),
    });

    const events = fake.inserted("events");
    assert.equal(events.length, 1);
    assert.equal(events[0].kind, "fixture_finished");
    assert.equal(events[0].fixture_id, "f1");
  });

  test("un match encore en cours ne déclenche aucun calcul", async () => {
    // Distribuer les points à la mi-temps afficherait un classement faux.
    const { client } = fakeSupabase(seed());
    let called = false;

    const report = await syncLive(
      context(client, [providerFixture({ status: "live", homeScore: 10, awayScore: 7 })]),
      {
        now: NOW, date: "2026-09-05",
        recompute: async () => { called = true; return { fixtures: 0, predictions: 0 }; },
      },
    );

    assert.deepEqual(report.finished, []);
    assert.equal(called, false, "aucun point ne doit être distribué avant la fin du match");
    assert.equal(report.predictionsScored, 0);
  });

  test("un calcul en échec n'efface pas le score déjà écrit", async () => {
    // Le score est acquis : mieux vaut le garder et signaler, que tout perdre.
    const fake = fakeSupabase(seed());

    const report = await syncLive(context(fake.client, [providerFixture()]), {
      now: NOW, date: "2026-09-05",
      recompute: async () => { throw new Error("barème introuvable"); },
    });

    assert.equal(fake.db.fixtures[0].home_score, 24, "le score reste écrit");
    assert.equal(report.predictionsScored, 0);
    assert.ok(
      report.warnings.some((w) => w.includes("points non calculés")),
      `l'échec doit être signalé, reçu : ${JSON.stringify(report.warnings)}`,
    );
  });
});
