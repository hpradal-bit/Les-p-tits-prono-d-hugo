import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exactScoreBudget,
  exactScoreSentence,
  exactScoreVerdict,
  isFixtureEligible,
  monthKeyOf,
  type ExactAttempt,
} from "./exact-score.ts";
import type { MarginBucket, Ruleset } from "../types.ts";

const buckets: MarginBucket[] = [
  { id: "b1", position: 1, minPoints: 0, maxPoints: 5, label: "0-5" },
  { id: "b2", position: 2, minPoints: 6, maxPoints: 10, label: "6-10" },
  { id: "b3", position: 3, minPoints: 11, maxPoints: 15, label: "11-15" },
];

function makeRuleset(exact: Partial<Ruleset["exactScore"]> = {}): Ruleset {
  return {
    id: "r1",
    version: 1,
    points: { wrong: 0, winner: 1, winner_and_margin: 3, exact_score: 10 },
    marginMode: "buckets",
    marginDistanceTolerance: 3,
    exactScore: { quota: 1, period: "round", imposedFixtureIds: [], ...exact },
    lock: { minutesBeforeKickoff: 120 },
    defaultPrediction: { enabled: true, outcome: "home", marginBucket: "median" },
    buckets,
  };
}

const SEASON = "s1";

function attempt(fixtureId: string, roundId: string, monthKey: string): ExactAttempt {
  return { fixtureId, roundId, seasonId: SEASON, monthKey };
}

const scope = (fixtureId: string, roundId: string, monthKey = "2026-09") => ({
  fixtureId,
  roundId,
  seasonId: SEASON,
  monthKey,
});

// --- Mode 3 du cahier des charges : un score exact par journée ---------------

test("un par journée : le premier passe, le second est refusé", () => {
  const rs = makeRuleset({ quota: 1, period: "round" });

  const libre = exactScoreVerdict(rs, [], scope("f1", "j1"));
  assert.equal(libre.allowed, true);
  assert.equal(libre.remaining, 1);

  const apres = exactScoreVerdict(rs, [attempt("f1", "j1", "2026-09")], scope("f2", "j1"));
  assert.equal(apres.allowed, false);
  assert.equal(apres.remaining, 0);
});

test("un par journée : on peut toujours corriger le score exact déjà posé", () => {
  const rs = makeRuleset({ quota: 1, period: "round" });
  const v = exactScoreVerdict(rs, [attempt("f1", "j1", "2026-09")], scope("f1", "j1"));
  assert.equal(v.allowed, true, "le match ne se compte pas contre lui-même");
});

test("un par journée : la journée suivante repart à zéro", () => {
  const rs = makeRuleset({ quota: 1, period: "round" });
  const v = exactScoreVerdict(rs, [attempt("f1", "j1", "2026-09")], scope("f9", "j2"));
  assert.equal(v.allowed, true);
  assert.equal(v.used, 0);
});

// --- Mode 1 : désactivé -------------------------------------------------------

test("quota 0 : le score exact est purement désactivé", () => {
  const rs = makeRuleset({ quota: 0 });
  const v = exactScoreVerdict(rs, [], scope("f1", "j1"));
  assert.equal(v.allowed, false);
  assert.equal(v.disabled, true);
  assert.equal(exactScoreSentence(v), "Score exact désactivé");
});

// --- Mode 2 : partout ---------------------------------------------------------

test("quota null : illimité, quel que soit le nombre de tentatives", () => {
  const rs = makeRuleset({ quota: null });
  const attempts = ["f1", "f2", "f3", "f4"].map((f) => attempt(f, "j1", "2026-09"));
  const v = exactScoreVerdict(rs, attempts, scope("f5", "j1"));
  assert.equal(v.allowed, true);
  assert.equal(v.unlimited, true);
  assert.equal(v.remaining, null);
});

// --- Mode 4 : matchs imposés par l'admin -------------------------------------

test("matchs imposés : seuls ces matchs acceptent un score exact", () => {
  const rs = makeRuleset({ quota: 1, imposedFixtureIds: ["f7"] });

  assert.equal(isFixtureEligible(rs, "f7"), true);
  assert.equal(isFixtureEligible(rs, "f1"), false);

  const refuse = exactScoreVerdict(rs, [], scope("f1", "j1"));
  assert.equal(refuse.allowed, false);
  assert.equal(refuse.eligible, false);

  const accepte = exactScoreVerdict(rs, [], scope("f7", "j1"));
  assert.equal(accepte.allowed, true);
});

// --- Mode 6 : N par journée ---------------------------------------------------

test("N par journée : trois autorisés, le quatrième est refusé", () => {
  const rs = makeRuleset({ quota: 3, period: "round" });
  const deux = [attempt("f1", "j1", "2026-09"), attempt("f2", "j1", "2026-09")];

  const troisieme = exactScoreVerdict(rs, deux, scope("f3", "j1"));
  assert.equal(troisieme.allowed, true);
  assert.equal(troisieme.remaining, 1);

  const trois = [...deux, attempt("f3", "j1", "2026-09")];
  const quatrieme = exactScoreVerdict(rs, trois, scope("f4", "j1"));
  assert.equal(quatrieme.allowed, false);
});

// --- Les autres périodes ------------------------------------------------------

test("période « mois » : les journées d'un même mois partagent le quota", () => {
  const rs = makeRuleset({ quota: 1, period: "month" });
  const septembre = [attempt("f1", "j1", "2026-09")];

  assert.equal(exactScoreVerdict(rs, septembre, scope("f9", "j2", "2026-09")).allowed, false);
  assert.equal(exactScoreVerdict(rs, septembre, scope("f20", "j5", "2026-10")).allowed, true);
});

test("période « saison » : un seul score exact sur toute la saison", () => {
  const rs = makeRuleset({ quota: 1, period: "season" });
  const un = [attempt("f1", "j1", "2026-09")];
  assert.equal(exactScoreVerdict(rs, un, scope("f80", "j13", "2026-12")).allowed, false);
});

test("période « match » : le quota ne se partage entre aucun match", () => {
  const rs = makeRuleset({ quota: 1, period: "match" });
  const attempts = ["f1", "f2", "f3"].map((f) => attempt(f, "j1", "2026-09"));
  assert.equal(exactScoreVerdict(rs, attempts, scope("f4", "j1")).allowed, true);
});

// --- Affichage ----------------------------------------------------------------

test("le budget affiché compte le score exact de la journée en cours", () => {
  const rs = makeRuleset({ quota: 2, period: "round" });
  const b = exactScoreBudget(rs, [attempt("f1", "j1", "2026-09")], scope("f1", "j1"));
  assert.equal(b.used, 1);
  assert.equal(b.remaining, 1);
  assert.equal(exactScoreSentence(b), "1 score exact restant cette journée");
});

test("la phrase s'accorde au pluriel", () => {
  const rs = makeRuleset({ quota: 3, period: "round" });
  const b = exactScoreBudget(rs, [], scope("f1", "j1"));
  assert.equal(exactScoreSentence(b), "3 scores exacts restants cette journée");
});

test("monthKeyOf découpe les mois dans le fuseau du jeu", () => {
  // 1er octobre 2026 à 00 h 30 à Paris = 30 septembre 22 h 30 UTC.
  assert.equal(monthKeyOf("2026-09-30T22:30:00Z", "Europe/Paris"), "2026-10");
  assert.equal(monthKeyOf("2026-09-30T22:30:00Z", "UTC"), "2026-09");
});
