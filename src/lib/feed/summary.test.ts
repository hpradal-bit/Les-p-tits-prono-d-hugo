import { describe, expect, it } from "vitest";
import { computeSummaryValues, type SummaryInput, type SummaryFixture } from "./summary";
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

    expect(values.n).toBe(5);
    expect(values.round).toBe("Journée 5");
    expect(values.leader).toBe("Hugo");
    expect(values.pts).toBe(45);
    expect(values.meilleur_joueur).toBe("Hugo");
    expect(values.pts_j).toBe(18);
  });

  it("identifie la plus grosse chute au classement", () => {
    const values = computeSummaryValues(makeInput());

    expect(values.plus_grosse_chute).toBe("Léa");
    expect(values.avant).toBe(1);
    expect(values.apres).toBe(2);
  });

  it("agrège les niveaux de tous les joueurs", () => {
    const values = computeSummaryValues(makeInput());

    expect(values.n_exacts).toBe(2);
    expect(values.n_vainqueurs).toBe(13);
  });

  it("identifie le match le plus mal pronostiqué", () => {
    const values = computeSummaryValues(makeInput());

    expect(values.match).toBe("La Rochelle - Racing");
    expect(values.n_erreurs).toBe(4);
  });

  it("renvoie null si personne n'a chuté", () => {
    const input = makeInput();
    for (const row of input.overallStandings.rows) {
      (row as StandingsRow).movement = 0;
    }
    const values = computeSummaryValues(input);

    expect(values.plus_grosse_chute).toBeNull();
    expect(values.avant).toBeNull();
    expect(values.apres).toBeNull();
  });

  it("renvoie null pour le match si aucune erreur", () => {
    const values = computeSummaryValues(
      makeInput({ fixtures: [{ homeTeam: "A", awayTeam: "B", wrongCount: 0 }] }),
    );

    expect(values.match).toBeNull();
    expect(values.n_erreurs).toBeNull();
  });

  it("gère un classement vide sans erreur", () => {
    const empty = makeTable([], "round");
    const values = computeSummaryValues(
      makeInput({ roundStandings: empty, overallStandings: makeTable([], "overall"), fixtures: [] }),
    );

    expect(values.leader).toBeNull();
    expect(values.meilleur_joueur).toBeNull();
    expect(values.n_exacts).toBe(0);
  });
});
