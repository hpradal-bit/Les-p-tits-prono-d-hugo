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
    minute: null,
    venue: null,
    roundLabel: null,
    ...over,
  };
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

/**
 * Le 19 septembre : six matchs à 16h35, un seul connu de TheSportsDB (qui
 * répondait pourtant sans erreur — juste sans ce match-là dans son relevé
 * « par date »), les cinq autres n'ayant de référence que chez ESPN. Comme
 * TheSportsDB n'avait techniquement pas échoué, `runWithFallback` s'arrêtait
 * là et ESPN n'était jamais consulté pour rattraper les cinq restants.
 */
describe("rattrapage d'un jour resté bloqué : couverture partielle d'un fournisseur", () => {
  const STALE_KICKOFF = "2026-09-19T14:35:00.000Z";
  /** Bien après la fenêtre du match, un autre jour : déclenche le rattrapage. */
  const LATER = new Date("2026-09-20T10:00:00.000Z");

  function namedProvider(name: string, fixtures: ProviderFixture[]): SportsDataProvider {
    return {
      name,
      dailyQuota: null,
      getFixtures: async () => ({ provider: name, data: [], requestsUsed: 1, warnings: [] }),
      getLiveScores: async () => ({ provider: name, data: fixtures, requestsUsed: 1, warnings: [] }),
      getStandings: async () => ({ provider: name, data: [], requestsUsed: 1, warnings: [] }),
    };
  }

  function seedTwoStaleFixtures() {
    return {
      seasons: [{ id: SEASON, label: "2026/2027", competition_id: "c1", starts_on: "2026-09-01", status: "active" }],
      rounds: [{ id: "r1", season_id: SEASON, number: 3, name: "J3" }],
      fixtures: [
        {
          id: "known-to-a", round_id: "r1", season_id: SEASON,
          home_team_id: "t-a-home", away_team_id: "t-a-away",
          kickoff_at: STALE_KICKOFF, kickoff_confirmed: true, locks_at: "2026-09-19T12:35:00.000Z",
          status: "scheduled", home_score: null, away_score: null, minute: null,
          venue: null, data_source: "alpha", updated_at: null, last_synced_at: null,
        },
        {
          id: "known-to-b", round_id: "r1", season_id: SEASON,
          home_team_id: "t-b-home", away_team_id: "t-b-away",
          kickoff_at: STALE_KICKOFF, kickoff_confirmed: true, locks_at: "2026-09-19T12:35:00.000Z",
          status: "scheduled", home_score: null, away_score: null, minute: null,
          venue: null, data_source: "alpha", updated_at: null, last_synced_at: null,
        },
      ],
      external_refs: [
        { provider: "alpha", entity_type: "season", entity_id: SEASON, external_id: "s-alpha" },
        { provider: "beta", entity_type: "season", entity_id: SEASON, external_id: "s-beta" },
      ],
      sync_runs: [],
      events: [],
    };
  }

  function twoProviderContext(sb: unknown, aFixtures: ProviderFixture[], bFixtures: ProviderFixture[]): SyncContext {
    const chain = { providers: [namedProvider("alpha", aFixtures), namedProvider("beta", bFixtures)], skipped: [] };
    return {
      sb,
      season: { id: SEASON, label: "2026/2027", competitionId: "c1", startsOn: "2026-09-01", endsOn: null },
      settings: [],
      // Des noms sans le moindre mot en commun : deux discriminants réduits à
      // une seule lettre (« Équipe A »/« Équipe B ») se seraient effondrés au
      // même jeu de mots significatifs (`significantTokens` écarte les mots
      // d'une lettre) et auraient produit une égalité — jamais rapprochée,
      // par prudence (`matchTeam`). Un vrai nom de club n'a pas ce problème.
      teams: [
        { id: "t-a-home", name: "Vulcains", shortName: "Vulcains", code: "VUL" },
        { id: "t-a-away", name: "Griffons", shortName: "Griffons", code: "GRI" },
        { id: "t-b-home", name: "Marmottes", shortName: "Marmottes", code: "MAR" },
        { id: "t-b-away", name: "Iguanes", shortName: "Iguanes", code: "IGU" },
      ],
      aliases: {},
      chain,
      chainFor: () => chain,
      lockMinutes: 120,
      apisportsUsedToday: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  test("le fournisseur B rattrape ce que A ne connaissait pas, sans écraser ce que A a déjà donné", async () => {
    const fake = fakeSupabase(seedTwoStaleFixtures());

    const aOnly = providerFixture({
      externalId: "a-1",
      kickoffAt: STALE_KICKOFF,
      status: "finished",
      homeTeam: { externalId: "e-a-home", name: "Vulcains", aliases: [] },
      awayTeam: { externalId: "e-a-away", name: "Griffons", aliases: [] },
      homeScore: 20,
      awayScore: 15,
    });
    const bOnly = providerFixture({
      externalId: "b-1",
      kickoffAt: STALE_KICKOFF,
      status: "finished",
      homeTeam: { externalId: "e-b-home", name: "Marmottes", aliases: [] },
      awayTeam: { externalId: "e-b-away", name: "Iguanes", aliases: [] },
      homeScore: 18,
      awayScore: 22,
    });

    const report = await syncLive(twoProviderContext(fake.client, [aOnly], [bOnly]), {
      now: LATER,
      date: "2026-09-20",
      recompute: async (_sb, ids) => ({ fixtures: ids.length, predictions: 0 }),
    });

    const byId = new Map(fake.db.fixtures.map((f) => [f.id as string, f]));
    const a = byId.get("known-to-a") as { home_score: number | null; away_score: number | null };
    const b = byId.get("known-to-b") as { home_score: number | null; away_score: number | null };
    assert.equal(a.home_score, 20, "A doit avoir mis à jour son propre match");
    assert.equal(a.away_score, 15);
    assert.equal(b.home_score, 18, "B doit avoir rattrapé le match que A ne connaissait pas du tout");
    assert.equal(b.away_score, 22);
    assert.deepEqual(
      new Set(report.finished),
      new Set(["known-to-a", "known-to-b"]),
      "les deux matchs doivent être reconnus comme terminés, pas seulement celui du premier fournisseur",
    );
  });
});
