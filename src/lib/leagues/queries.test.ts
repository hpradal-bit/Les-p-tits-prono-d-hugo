import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { fakeSupabase } from "../providers/sync/fake-supabase.ts";
import {
  resolveLeagueForSeason,
  resolveLeagueForRound,
  resolveLeagueForFixture,
  loadLeaguesForCompetition,
} from "./queries.ts";

/**
 * Audit technique, point 2 et point 3 (P0) : `requireAdmin(leagueId)` et le
 * nouveau relevé de classement par ligue (`src/app/api/sync/live/route.ts`)
 * s'appuient tous les deux sur la résolution fiable d'une ligue à partir
 * d'un match/journée/saison. Ces tests couvrent cette résolution — la partie
 * qui ne dépend d'aucune session HTTP et peut donc s'éprouver isolément,
 * avec le même faux client que les tests de synchronisation.
 */

function seed() {
  return {
    leagues: [
      { id: "league-a", competition_id: "comp-1", name: "Ligue A", created_at: "2026-01-01" },
      { id: "league-b", competition_id: "comp-1", name: "Ligue B", created_at: "2026-02-01" },
      { id: "league-c", competition_id: "comp-2", name: "Ligue C", created_at: "2026-01-01" },
    ],
    seasons: [
      { id: "season-1", competition_id: "comp-1" },
      { id: "season-2", competition_id: "comp-2" },
    ],
    rounds: [{ id: "round-1", season_id: "season-1" }],
    fixtures: [{ id: "fixture-1", round_id: "round-1" }],
  };
}

describe("resolveLeagueForSeason", () => {
  test("renvoie la ligue la plus ancienne quand plusieurs partagent la compétition", async () => {
    const { client } = fakeSupabase(seed());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leagueId = await resolveLeagueForSeason(client as any, "season-1");
    assert.equal(leagueId, "league-a");
  });

  test("renvoie null si la saison n'existe pas", async () => {
    const { client } = fakeSupabase(seed());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leagueId = await resolveLeagueForSeason(client as any, "season-inconnue");
    assert.equal(leagueId, null);
  });
});

describe("loadLeaguesForCompetition", () => {
  test("renvoie TOUTES les ligues d'une compétition, pas seulement la première", async () => {
    const { client } = fakeSupabase(seed());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leagues = await loadLeaguesForCompetition(client as any, "comp-1");
    assert.equal(leagues.length, 2);
    assert.deepEqual(
      leagues.map((l) => l.leagueId).sort(),
      ["league-a", "league-b"],
    );
  });
});

describe("resolveLeagueForRound / resolveLeagueForFixture", () => {
  test("resolveLeagueForRound remonte jusqu'à la ligue via la saison", async () => {
    const { client } = fakeSupabase(seed());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leagueId = await resolveLeagueForRound(client as any, "round-1");
    assert.equal(leagueId, "league-a");
  });

  test("resolveLeagueForFixture remonte jusqu'à la ligue via la journée puis la saison", async () => {
    const { client } = fakeSupabase(seed());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leagueId = await resolveLeagueForFixture(client as any, "fixture-1");
    assert.equal(leagueId, "league-a");
  });

  test("resolveLeagueForFixture renvoie null pour un match inconnu", async () => {
    const { client } = fakeSupabase(seed());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leagueId = await resolveLeagueForFixture(client as any, "fixture-inconnu");
    assert.equal(leagueId, null);
  });
});
