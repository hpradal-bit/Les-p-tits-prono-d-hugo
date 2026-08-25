import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeSummaryValues, type SummaryInput, type SummaryFixture } from "./summary.ts";
import type { StandingsRow, StandingsTable } from "@/lib/standings/engine";

function makePlayer(id: string, first: string) {
  return { userId: id, firstName: first, displayName: first, avatarKind: "emoji" as const, avatarValue: "🏉" };
}

function makeRow(overrides: Partial<StandingsRow> & { position: number; points: number; firstName: string }): StandingsRow {
  return {
    position: overrides.position,
    player: makePlayer(overrides.firstName.toLowerCase(), overrides.firstName),
    points: overrides.points,
    predictionPoints: overrides.points,
    bonusPoints: 0,
    adjustmentPoints: 0,
    played: 7,
    recentForm: [],
    counts: { wrong: 2, winner: 3, winner_and_margin: 1, exact_score: 1, ...overrides.counts },
    successRate: 0.71,
    streak: null,
    previousPosition: overrides.previousPosition ?? null,
    movement: overrides.movement ?? null,
  };
}

function makeTable(rows: StandingsRow[], kind: "round" | "overall" = "round"): StandingsTable {
  return {
    kind,
    scope: "official",
    roundIds: ["r1"],
    referenceRoundId: "r1",
    previousRoundId: null,
    rows,
  };
}

function makeInput(overrides: Partial<SummaryInput> = {}): SummaryInput {
  const roundRows = [
    makeRow({ position: 1, points: 18, firstName: "Hugo", counts: { wrong: 1, winner: 3, winner_and_margin: 2, exact_score: 1 } }),
    makeRow({ position: 2, points: 12, firstName: "Léa", counts: { wrong: 3, winner: 2, winner_and_margin: 1, exact_score: 1 } }),
    makeRow({ position: 3, points: 8, firstName: "Tom", counts: { wrong: 4, winner: 2, winner_and_margin: 1, exact_score: 0 } }),
  ];

  const overallRows = [
    makeRow({ position: 1, points: 45, firstName: "Hugo", previousPosition: 2, movement: 1 }),
    makeRow({ position: 2, points: 42, firstName: "Léa", previousPosition: 1, movement: -1 }),
    makeRow({ position: 3, points: 30, firstName: "Tom", previousPosition: 3, movement: 0 }),
  ];

  const fixtures: SummaryFixture[] = [
    { homeTeam: "Toulouse", awayTeam: "Toulon", wrongCount: 2 },
    { homeTeam: "La Rochelle", awayTeam: "Racing", wrongCount: 4 },
    { homeTeam: "Bordeaux", awayTeam: "Lyon", wrongCount: 1 },
  ];

  return {
    roundName: "Journée 5",
    roundNumber: 5,
    roundStandings: makeTable(roundRows, "round"),
    overallStandings: makeTable(overallRows, "overall"),
    fixtures,
    ...overrides,
  };
}

describe("computeSummaryValues", () => {
  it("calcule toutes les valeurs du résumé", () => {
    const values = computeSummaryValues(makeInput());

    assert.equal(values.n, 5);
    assert.equal(values.round, "Journée 5");
    assert.equal(values.leader, "Hugo");
    assert.equal(values.pts, 45);
    assert.equal(values.meilleur_joueur, "Hugo");
    assert.equal(values.pts_j, 18);
  });

  it("identifie la plus grosse chute au classement", () => {
    const values = computeSummaryValues(makeInput());

    assert.equal(values.plus_grosse_chute, "Léa");
    assert.equal(values.avant, 1);
    assert.equal(values.apres, 2);
  });

  it("agrège les niveaux de tous les joueurs", () => {
    const values = computeSummaryValues(makeInput());

    assert.equal(values.n_exacts, 2);
    assert.equal(values.n_vainqueurs, 13);
  });

  it("identifie le match le plus mal pronostiqué", () => {
    const values = computeSummaryValues(makeInput());

    assert.equal(values.match, "La Rochelle - Racing");
    assert.equal(values.n_erreurs, 4);
  });

  it("renvoie null si personne n'a chuté", () => {
    const input = makeInput();
    for (const row of input.overallStandings.rows) {
      (row as StandingsRow).movement = 0;
    }
    const values = computeSummaryValues(input);

    assert.equal(values.plus_grosse_chute, null);
    assert.equal(values.avant, null);
    assert.equal(values.apres, null);
  });

  it("renvoie null pour le match si aucune erreur", () => {
    const values = computeSummaryValues(
      makeInput({ fixtures: [{ homeTeam: "A", awayTeam: "B", wrongCount: 0 }] }),
    );

    assert.equal(values.match, null);
    assert.equal(values.n_erreurs, null);
  });

  it("gère un classement vide sans erreur", () => {
    const empty = makeTable([], "round");
    const values = computeSummaryValues(
      makeInput({ roundStandings: empty, overallStandings: makeTable([], "overall"), fixtures: [] }),
    );

    assert.equal(values.leader, null);
    assert.equal(values.meilleur_joueur, null);
    assert.equal(values.n_exacts, 0);
  });
});
