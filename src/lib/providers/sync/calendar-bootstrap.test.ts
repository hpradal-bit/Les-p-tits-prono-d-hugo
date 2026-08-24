import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { syncCalendar } from "./calendar.ts";
import { fakeSupabase } from "./fake-supabase.ts";
import type { SyncContext } from "./context.ts";
import type { ProviderFixture, SportsDataProvider } from "../types.ts";

/**
 * Ajouter une compétition sans saisir son effectif à la main.
 *
 * Le rapprochement d'équipes ne crée jamais d'équipe : sur une saison en cours,
 * une graphie inhabituelle doit produire un avertissement, pas un doublon. Mais
 * cette prudence rendait toute *nouvelle* compétition inaccessible — seize
 * clubs à saisir avant même de savoir si le fournisseur répond.
 *
 * L'exception est étroite : seulement quand la saison est vide.
 */

const SEASON = "s-prod2";
const COMPETITION = "c-prod2";

function fixture(home: string, away: string, id: string): ProviderFixture {
  return {
    externalId: id,
    kickoffAt: "2026-08-27T18:30:00.000Z",
    kickoffPrecise: true,
    status: "scheduled",
    homeTeam: { externalId: `e-${home}`, name: home, aliases: [] },
    awayTeam: { externalId: `e-${away}`, name: away, aliases: [] },
    homeScore: null,
    awayScore: null,
    minute: null,
    venue: null,
    roundLabel: null,
  };
}

function provider(fixtures: ProviderFixture[]): SportsDataProvider {
  return {
    name: "espn",
    dailyQuota: null,
    getFixtures: async () => ({ provider: "espn", data: fixtures, requestsUsed: 1, warnings: [] }),
    getLiveScores: async () => ({ provider: "espn", data: [], requestsUsed: 1, warnings: [] }),
    getStandings: async () => ({ provider: "espn", data: [], requestsUsed: 1, warnings: [] }),
  };
}

function seed() {
  return {
    sports: [{ id: "sp-rugby", code: "rugby", name: "Rugby" }],
    competitions: [{ id: COMPETITION, sport_id: "sp-rugby", code: "prod2", name: "Pro D2" }],
    seasons: [{ id: SEASON, label: "2026/2027", competition_id: COMPETITION, status: "draft" }],
    rounds: [], fixtures: [], teams: [], season_teams: [],
    external_refs: [
      { provider: "espn", entity_type: "competition", entity_id: COMPETITION, external_id: "999" },
    ],
    sync_runs: [], events: [],
  };
}

function context(sb: unknown, fixtures: ProviderFixture[], teams: unknown[] = []): SyncContext {
  const chain = { providers: [provider(fixtures)], skipped: [] };
  return {
    sb,
    season: {
      id: SEASON, label: "2026/2027", competitionId: COMPETITION,
      startsOn: "2026-08-20", endsOn: null,
    },
    settings: [], teams, aliases: {},
    chain, chainFor: () => chain, lockMinutes: 120, apisportsUsedToday: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("amorcer une compétition nouvelle", () => {
  const matchs = [
    fixture("Provence Rugby", "Colomiers Rugby", "m1"),
    fixture("US Montauban", "CA Brive", "m2"),
  ];

  test("les équipes inconnues sont créées quand la saison est vide", async () => {
    const fake = fakeSupabase(seed());
    const report = await syncCalendar(context(fake.client, matchs));

    assert.equal(report.teamsCreated.length, 4, `reçu : ${JSON.stringify(report.teamsCreated)}`);
    assert.deepEqual(
      [...report.teamsCreated].sort(),
      ["CA Brive", "Colomiers Rugby", "Provence Rugby", "US Montauban"],
    );
  });

  test("chaque équipe créée est rattachée à la saison", async () => {
    // Sans ce rattachement, les équipes existent mais la compétition est vide.
    const fake = fakeSupabase(seed());
    await syncCalendar(context(fake.client, matchs));

    assert.equal(fake.inserted("season_teams").length, 4);
    assert.ok(fake.inserted("season_teams").every((r) => r.season_id === SEASON));
  });

  test("les correspondances du fournisseur sont écrites", async () => {
    // Pour que le passage suivant n'ait plus rien à deviner.
    const fake = fakeSupabase(seed());
    await syncCalendar(context(fake.client, matchs));

    const refs = fake.inserted("external_refs").filter((r) => r.entity_type === "team");
    assert.equal(refs.length, 4);
    assert.ok(refs.every((r) => r.provider === "espn"));
  });

  test("l'amorçage est signalé, car les codes sont provisoires", async () => {
    const fake = fakeSupabase(seed());
    const report = await syncCalendar(context(fake.client, matchs));

    assert.ok(
      report.warnings.some((w) => w.includes("amorçage")),
      `l'opération doit être visible, reçu : ${JSON.stringify(report.warnings)}`,
    );
  });

  test("une saison qui a déjà des équipes n'est jamais amorcée", async () => {
    // C'est le garde-fou : sur une compétition établie, un nom inconnu doit
    // rester un avertissement, jamais une équipe créée en double.
    const fake = fakeSupabase(seed());
    const connues = [
      { id: "t1", code: "PR", name: "Provence Rugby", shortName: "Provence", city: null },
    ];

    const report = await syncCalendar(context(fake.client, matchs, connues));

    assert.deepEqual(report.teamsCreated, []);
    assert.equal(fake.inserted("teams").length, 0, "aucune équipe ne doit être créée");
    assert.ok(report.unmatched.length > 0, "les noms inconnus restent signalés");
  });

  test("un fournisseur muet ne crée rien", async () => {
    // Zéro match reçu ne doit pas se traduire par un effectif vide « créé ».
    const fake = fakeSupabase(seed());
    const report = await syncCalendar(context(fake.client, []));

    assert.deepEqual(report.teamsCreated, []);
    assert.equal(fake.inserted("teams").length, 0);
  });
});
