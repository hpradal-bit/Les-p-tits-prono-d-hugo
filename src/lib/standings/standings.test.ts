import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeStandings,
  currentStreak,
  playedRounds,
  DEFAULT_FORM_WINDOW,
} from "./engine.ts";
import type {
  AdjustmentEntry,
  BonusEntry,
  PlayerRef,
  RoundRef,
  ScoreEntry,
  StandingsInput,
} from "./engine.ts";
import { explainScore, levelFromBreakdown, parseBreakdown } from "./breakdown.ts";
import type { FixtureStatus, ScoreLevel } from "../types.ts";

// --- Jeu d'essai ------------------------------------------------------------

function player(id: string, firstName: string): PlayerRef {
  return {
    userId: id,
    firstName,
    displayName: firstName,
    avatarKind: "emoji",
    avatarValue: "🏉",
  };
}

const alice = player("u-alice", "Alice");
const bruno = player("u-bruno", "Bruno");
const chloe = player("u-chloe", "Chloé");
const david = player("u-david", "David");
const players = [alice, bruno, chloe, david];

function rounds(count: number): RoundRef[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i + 1}`,
    number: i + 1,
    name: `J${i + 1}`,
  }));
}

const POINTS: Record<ScoreLevel, number> = {
  wrong: 0,
  winner: 1,
  winner_and_margin: 3,
  exact_score: 10,
};

let fixtureCounter = 0;

/** Un pronostic noté. Le coup d'envoi suit le numéro de journée. */
function entry(
  userId: string,
  roundId: string,
  level: ScoreLevel,
  options: { fixtureId?: string; status?: FixtureStatus; kickoffAt?: string } = {},
): ScoreEntry {
  fixtureCounter += 1;
  const roundNumber = Number(roundId.replace("r", ""));
  return {
    userId,
    roundId,
    fixtureId: options.fixtureId ?? `f${fixtureCounter}`,
    kickoffAt: options.kickoffAt ?? `2026-09-${String(roundNumber).padStart(2, "0")}T15:00:00Z`,
    fixtureStatus: options.status ?? "official",
    points: POINTS[level],
    level,
  };
}

function input(partial: Partial<StandingsInput>): StandingsInput {
  return {
    players,
    rounds: rounds(3),
    entries: [],
    adjustments: [],
    bonuses: [],
    ...partial,
  };
}

// --- Classement de journée --------------------------------------------------

test("classement de journée : les points de la seule journée demandée", () => {
  const data = input({
    entries: [
      entry(alice.userId, "r1", "exact_score"),
      entry(alice.userId, "r2", "wrong"),
      entry(bruno.userId, "r1", "winner"),
      entry(bruno.userId, "r2", "exact_score"),
    ],
  });

  const j1 = computeStandings(data, { kind: "round", scope: "live", roundId: "r1" });
  assert.deepEqual(
    j1.rows.map((r) => [r.player.firstName, r.points]),
    [
      ["Alice", 10],
      ["Bruno", 1],
      ["Chloé", 0],
      ["David", 0],
    ],
  );
  assert.deepEqual(j1.roundIds, ["r1"]);
});

test("classement général : le cumul de toutes les journées jouées", () => {
  const data = input({
    entries: [
      entry(alice.userId, "r1", "exact_score"),
      entry(alice.userId, "r2", "wrong"),
      entry(bruno.userId, "r1", "winner"),
      entry(bruno.userId, "r2", "exact_score"),
    ],
  });

  const general = computeStandings(data, { kind: "overall", scope: "live" });
  assert.deepEqual(
    general.rows.map((r) => [r.player.firstName, r.points, r.position]),
    [
      ["Bruno", 11, 1],
      ["Alice", 10, 2],
      ["Chloé", 0, 3],
      ["David", 0, 3],
    ],
  );
  assert.deepEqual(general.roundIds, ["r1", "r2"]);
});

test("une journée sans aucun résultat n'entre pas dans le classement", () => {
  const data = input({ entries: [entry(alice.userId, "r1", "winner")] });
  assert.deepEqual(
    playedRounds(data.rounds, data.entries, "live").map((r) => r.name),
    ["J1"],
  );

  const j3 = computeStandings(data, { kind: "round", scope: "live", roundId: "r3" });
  assert.equal(j3.referenceRoundId, null);
  assert.deepEqual(j3.roundIds, []);
  assert.deepEqual(new Set(j3.rows.map((r) => r.points)), new Set([0]));
});

// --- Live vs officiel : un moteur, deux filtres ------------------------------

test("le classement officiel ne compte que les matchs au statut official", () => {
  const data = input({
    entries: [
      entry(alice.userId, "r1", "exact_score", { status: "official" }),
      entry(alice.userId, "r2", "exact_score", { status: "live" }),
      entry(bruno.userId, "r1", "winner", { status: "official" }),
      entry(bruno.userId, "r2", "winner", { status: "finished" }),
    ],
  });

  const live = computeStandings(data, { kind: "overall", scope: "live" });
  assert.equal(live.rows.find((r) => r.player.userId === alice.userId)!.points, 20);
  assert.equal(live.rows.find((r) => r.player.userId === bruno.userId)!.points, 2);

  const officiel = computeStandings(data, { kind: "overall", scope: "official" });
  assert.equal(officiel.rows.find((r) => r.player.userId === alice.userId)!.points, 10);
  assert.equal(officiel.rows.find((r) => r.player.userId === bruno.userId)!.points, 1);
  assert.deepEqual(officiel.roundIds, ["r1"]);
});

test("un match reporté ou annulé ne compte dans aucune portée", () => {
  const data = input({
    entries: [
      entry(alice.userId, "r1", "exact_score", { status: "postponed" }),
      entry(bruno.userId, "r1", "exact_score", { status: "cancelled" }),
      entry(chloe.userId, "r1", "winner", { status: "finished" }),
    ],
  });
  const live = computeStandings(data, { kind: "overall", scope: "live" });
  assert.equal(live.rows.find((r) => r.player.userId === alice.userId)!.points, 0);
  assert.equal(live.rows.find((r) => r.player.userId === bruno.userId)!.points, 0);
  assert.equal(live.rows.find((r) => r.player.userId === chloe.userId)!.points, 1);
});

// --- Classement forme --------------------------------------------------------

test("le classement forme ne retient que les 5 dernières journées jouées", () => {
  assert.equal(DEFAULT_FORM_WINDOW, 5);
  const entries: ScoreEntry[] = [];
  for (let i = 1; i <= 7; i += 1) {
    // Alice marque gros sur les deux premières journées, puis plus rien.
    entries.push(entry(alice.userId, `r${i}`, i <= 2 ? "exact_score" : "wrong"));
    // Bruno est régulier.
    entries.push(entry(bruno.userId, `r${i}`, "winner_and_margin"));
  }

  const data = input({ rounds: rounds(7), entries });

  const general = computeStandings(data, { kind: "overall", scope: "live" });
  assert.equal(general.rows[0].player.firstName, "Bruno"); // 21 contre 20

  const forme = computeStandings(data, { kind: "form", scope: "live" });
  assert.deepEqual(forme.roundIds, ["r3", "r4", "r5", "r6", "r7"]);
  assert.equal(forme.rows[0].player.firstName, "Bruno");
  assert.equal(forme.rows[0].points, 15);
  assert.equal(forme.rows.find((r) => r.player.userId === alice.userId)!.points, 0);
});

test("la fenêtre de forme est réglable", () => {
  const entries: ScoreEntry[] = [];
  for (let i = 1; i <= 7; i += 1) entries.push(entry(alice.userId, `r${i}`, "winner"));
  const data = input({ rounds: rounds(7), entries });
  const forme = computeStandings(data, { kind: "form", scope: "live", formWindow: 3 });
  assert.deepEqual(forme.roundIds, ["r5", "r6", "r7"]);
  assert.equal(forme.rows[0].points, 3);
});

// --- Départages ---------------------------------------------------------------

test("départage 1 : à points égaux, le plus de scores exacts passe devant", () => {
  const data = input({
    entries: [
      // Alice : 10 + 0 = 10 avec un score exact
      entry(alice.userId, "r1", "exact_score"),
      entry(alice.userId, "r1", "wrong"),
      // Bruno : 3 + 3 + 3 + 1 = 10 sans score exact
      entry(bruno.userId, "r1", "winner_and_margin"),
      entry(bruno.userId, "r1", "winner_and_margin"),
      entry(bruno.userId, "r1", "winner_and_margin"),
      entry(bruno.userId, "r1", "winner"),
    ],
  });
  const table = computeStandings(data, { kind: "overall", scope: "live" });
  assert.equal(table.rows[0].player.firstName, "Alice");
  assert.equal(table.rows[0].position, 1);
  assert.equal(table.rows[1].player.firstName, "Bruno");
  assert.equal(table.rows[1].position, 2);
});

test("départage 2 : à égalité de scores exacts, le plus de vainqueurs + écart", () => {
  const data = input({
    entries: [
      // Alice : 3 + 1 + 1 + 1 = 6
      entry(alice.userId, "r1", "winner_and_margin"),
      entry(alice.userId, "r1", "winner"),
      entry(alice.userId, "r1", "winner"),
      entry(alice.userId, "r1", "winner"),
      // Bruno : 3 + 3 = 6
      entry(bruno.userId, "r1", "winner_and_margin"),
      entry(bruno.userId, "r1", "winner_and_margin"),
    ],
  });
  const table = computeStandings(data, { kind: "overall", scope: "live" });
  assert.equal(table.rows[0].player.firstName, "Bruno");
  assert.equal(table.rows[1].player.firstName, "Alice");
});

test("départage 3 : à égalité parfaite, le plus de pronostics réussis", () => {
  const data = input({
    entries: [
      // Alice : 1 + 1 = 2 points, 2 pronostics réussis
      entry(alice.userId, "r1", "winner"),
      entry(alice.userId, "r1", "winner"),
      // Bruno : 2 points par ajustement, aucun pronostic réussi
      entry(bruno.userId, "r1", "wrong"),
    ],
    adjustments: [{ userId: bruno.userId, roundId: "r1", delta: 2 }],
  });
  const table = computeStandings(data, { kind: "overall", scope: "live" });
  assert.equal(table.rows[0].player.firstName, "Alice");
  assert.equal(table.rows[1].player.firstName, "Bruno");
  assert.equal(table.rows[1].points, 2);
});

test("ex æquo : même position, et la place suivante est sautée", () => {
  const data = input({
    entries: [
      entry(alice.userId, "r1", "winner_and_margin"),
      entry(bruno.userId, "r1", "winner_and_margin"),
      entry(chloe.userId, "r1", "winner"),
      entry(david.userId, "r1", "wrong"),
    ],
  });
  const table = computeStandings(data, { kind: "overall", scope: "live" });
  assert.deepEqual(
    table.rows.map((r) => [r.player.firstName, r.position]),
    [
      ["Alice", 1],
      ["Bruno", 1],
      ["Chloé", 3],
      ["David", 4],
    ],
  );
});

// --- Évolution, taux de réussite, série ---------------------------------------

test("l'évolution se lit par rapport au classement de la journée précédente", () => {
  const data = input({
    entries: [
      // J1 : Bruno devant Alice
      entry(alice.userId, "r1", "winner"),
      entry(bruno.userId, "r1", "exact_score"),
      // J2 : Alice repasse devant au cumul
      entry(alice.userId, "r2", "exact_score"),
      entry(alice.userId, "r2", "exact_score"),
      entry(bruno.userId, "r2", "wrong"),
    ],
  });
  const table = computeStandings(data, { kind: "overall", scope: "live" });
  const a = table.rows.find((r) => r.player.userId === alice.userId)!;
  const b = table.rows.find((r) => r.player.userId === bruno.userId)!;

  assert.equal(a.position, 1);
  assert.equal(a.previousPosition, 2);
  assert.equal(a.movement, 1); // une place gagnée
  assert.equal(b.position, 2);
  assert.equal(b.previousPosition, 1);
  assert.equal(b.movement, -1);
});

test("sans journée précédente, l'évolution n'existe pas", () => {
  const data = input({ entries: [entry(alice.userId, "r1", "winner")] });
  const table = computeStandings(data, { kind: "overall", scope: "live" });
  assert.equal(table.rows[0].previousPosition, null);
  assert.equal(table.rows[0].movement, null);
});

test("taux de réussite : part des pronostics rapportant au moins un point", () => {
  const data = input({
    entries: [
      entry(alice.userId, "r1", "exact_score"),
      entry(alice.userId, "r1", "winner"),
      entry(alice.userId, "r1", "wrong"),
      entry(alice.userId, "r1", "wrong"),
    ],
  });
  const row = computeStandings(data, { kind: "overall", scope: "live" }).rows.find(
    (r) => r.player.userId === alice.userId,
  )!;
  assert.equal(row.played, 4);
  assert.equal(row.successRate, 0.5);
  assert.deepEqual(row.counts, {
    wrong: 2,
    winner: 1,
    winner_and_margin: 0,
    exact_score: 1,
  });

  const jamais = computeStandings(data, { kind: "overall", scope: "live" }).rows.find(
    (r) => r.player.userId === david.userId,
  )!;
  assert.equal(jamais.successRate, null);
  assert.equal(jamais.streak, null);
});

test("série en cours : les derniers pronostics, dans l'ordre des coups d'envoi", () => {
  const entries = [
    entry(alice.userId, "r1", "wrong", { kickoffAt: "2026-09-05T15:00:00Z" }),
    entry(alice.userId, "r1", "winner", { kickoffAt: "2026-09-05T17:00:00Z" }),
    entry(alice.userId, "r2", "exact_score", { kickoffAt: "2026-09-12T15:00:00Z" }),
    entry(alice.userId, "r2", "winner_and_margin", { kickoffAt: "2026-09-12T17:00:00Z" }),
  ];
  assert.deepEqual(currentStreak(entries), { kind: "good", length: 3 });
  assert.deepEqual(currentStreak([...entries].reverse()), { kind: "good", length: 3 });

  const rates = [
    ...entries,
    entry(alice.userId, "r3", "wrong", { kickoffAt: "2026-09-19T15:00:00Z" }),
    entry(alice.userId, "r3", "wrong", { kickoffAt: "2026-09-19T17:00:00Z" }),
  ];
  assert.deepEqual(currentStreak(rates), { kind: "bad", length: 2 });
});

test("la série se calcule jusqu'à la journée de référence, pas au-delà", () => {
  const data = input({
    entries: [
      entry(alice.userId, "r1", "winner"),
      entry(alice.userId, "r2", "winner"),
      entry(alice.userId, "r3", "wrong"),
    ],
  });
  const j2 = computeStandings(data, { kind: "round", scope: "live", roundId: "r2" });
  assert.deepEqual(j2.rows.find((r) => r.player.userId === alice.userId)!.streak, {
    kind: "good",
    length: 2,
  });
});

// --- Ajustements et questions bonus -------------------------------------------

test("ajustements et bonus de journée s'ajoutent à la bonne journée", () => {
  const adjustments: AdjustmentEntry[] = [
    { userId: bruno.userId, roundId: "r1", delta: -2 },
    { userId: alice.userId, roundId: "r2", delta: 5 },
  ];
  const bonuses: BonusEntry[] = [{ userId: bruno.userId, roundId: "r1", points: 4 }];
  const data = input({
    entries: [entry(alice.userId, "r1", "winner"), entry(bruno.userId, "r2", "winner")],
    adjustments,
    bonuses,
  });

  const j1 = computeStandings(data, { kind: "round", scope: "live", roundId: "r1" });
  const brunoJ1 = j1.rows.find((r) => r.player.userId === bruno.userId)!;
  assert.equal(brunoJ1.points, 2); // -2 + 4
  assert.equal(brunoJ1.adjustmentPoints, -2);
  assert.equal(brunoJ1.bonusPoints, 4);

  const general = computeStandings(data, { kind: "overall", scope: "live" });
  assert.equal(general.rows.find((r) => r.player.userId === alice.userId)!.points, 6);
  assert.equal(general.rows.find((r) => r.player.userId === bruno.userId)!.points, 3);
});

test("un ajustement de saison ne pèse que sur le classement général à jour", () => {
  const data = input({
    entries: [entry(alice.userId, "r1", "winner"), entry(alice.userId, "r2", "winner")],
    adjustments: [{ userId: alice.userId, roundId: null, delta: 7 }],
    bonuses: [{ userId: alice.userId, roundId: null, points: 3 }],
  });

  const general = computeStandings(data, { kind: "overall", scope: "live" });
  assert.equal(general.rows[0].points, 12);

  const journee = computeStandings(data, { kind: "round", scope: "live", roundId: "r2" });
  assert.equal(journee.rows[0].points, 1);

  const forme = computeStandings(data, { kind: "form", scope: "live" });
  assert.equal(forme.rows[0].points, 2);
});

// --- Robustesse ----------------------------------------------------------------

test("le moteur est déterministe : l'ordre des entrées n'a aucune influence", () => {
  const entries: ScoreEntry[] = [];
  const levels: ScoreLevel[] = ["wrong", "winner", "winner_and_margin", "exact_score"];
  for (let r = 1; r <= 3; r += 1) {
    players.forEach((p, i) => {
      for (let m = 0; m < 4; m += 1) {
        entries.push(entry(p.userId, `r${r}`, levels[(i + m + r) % levels.length]));
      }
    });
  }
  const data = input({ entries });
  const reference = computeStandings(data, { kind: "overall", scope: "live" });

  for (let i = 0; i < 50; i += 1) {
    const shuffled = [...entries].sort(() => Math.random() - 0.5);
    const again = computeStandings(input({ entries: shuffled }), {
      kind: "overall",
      scope: "live",
    });
    assert.deepEqual(again, reference);
  }
});

test("un joueur sans le moindre pronostic figure quand même au classement", () => {
  const data = input({ entries: [entry(alice.userId, "r1", "winner")] });
  const table = computeStandings(data, { kind: "overall", scope: "live" });
  assert.equal(table.rows.length, players.length);
  assert.equal(table.rows.find((r) => r.player.userId === david.userId)!.points, 0);
});

test("un score orphelin (joueur inconnu) est ignoré sans faire tomber le calcul", () => {
  const data = input({
    entries: [entry("u-inconnu", "r1", "exact_score"), entry(alice.userId, "r1", "winner")],
  });
  const table = computeStandings(data, { kind: "overall", scope: "live" });
  assert.equal(table.rows.length, players.length);
  assert.equal(table.rows[0].player.firstName, "Alice");
});

// --- Lecture du détail des points ------------------------------------------------

test("le niveau se déduit du détail des points", () => {
  const base = {
    outcomeCorrect: true,
    marginCorrect: false,
    exactAttempted: false,
    exactCorrect: false,
    actualMargin: 6,
    actualBucketLabel: "6-10",
    predictedBucketLabel: null,
    marginDerivedFromExact: false,
  };
  assert.equal(levelFromBreakdown({ ...base, outcomeCorrect: false }), "wrong");
  assert.equal(levelFromBreakdown(base), "winner");
  assert.equal(levelFromBreakdown({ ...base, marginCorrect: true }), "winner_and_margin");
  assert.equal(
    levelFromBreakdown({ ...base, marginCorrect: true, exactCorrect: true }),
    "exact_score",
  );
});

test("le détail se relit en camelCase comme en snake_case", () => {
  const parsed = parseBreakdown({
    outcome_correct: true,
    margin_correct: true,
    actual_margin: 12,
    actual_bucket_label: "11-15",
    predicted_bucket_label: "11-15",
    margin_derived_from_exact: true,
  });
  assert.equal(parsed.outcomeCorrect, true);
  assert.equal(parsed.marginCorrect, true);
  assert.equal(parsed.actualMargin, 12);
  assert.equal(parsed.predictedBucketLabel, "11-15");
  assert.equal(parsed.marginDerivedFromExact, true);
  assert.equal(levelFromBreakdown(parsed), "winner_and_margin");
});

test("un détail vide ou illisible ne fait pas tomber l'affichage", () => {
  for (const value of [null, undefined, {}, "cassé", 42, []]) {
    const parsed = parseBreakdown(value);
    assert.equal(parsed.outcomeCorrect, false);
    assert.equal(levelFromBreakdown(parsed), "wrong");
    assert.equal(typeof explainScore(parsed), "string");
  }
});

test("l'explication dit pourquoi, y compris quand la tranche vient du score exact", () => {
  const explication = explainScore(
    parseBreakdown({
      outcomeCorrect: true,
      marginCorrect: true,
      exactAttempted: true,
      exactCorrect: false,
      actualMargin: 6,
      actualBucketLabel: "6-10",
      predictedBucketLabel: "6-10",
      marginDerivedFromExact: true,
    }),
  );
  assert.match(explication, /6-10/);
  assert.match(explication, /score exact/i);
});
