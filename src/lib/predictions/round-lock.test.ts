import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  applyDefaultPredictionsForRound,
  applyDefaultPredictionsForDueRounds,
} from "./round-lock.ts";
import { fakeSupabase } from "../providers/sync/fake-supabase.ts";

/**
 * Le rattrapage des oublis.
 *
 * Tout était écrit — le barème active le pronostic par défaut, le calcul des
 * points sait noter un pronostic automatique, les statistiques les comptent —
 * mais **rien ne les créait jamais** : ni le planificateur, ni un écran. Un
 * joueur qui oubliait marquait zéro, en silence, alors que le règlement lui
 * promettait un pronostic posé d'office.
 *
 * Le défaut n'était pas dans un calcul : il était dans un appel absent. Ces
 * tests traversent donc la chaîne plutôt que d'éprouver une fonction isolée.
 */

const ROUND = "r1";
const SEASON = "s1";
const PASSE = "2026-09-05T17:05:00.000Z"; // verrouillage déjà franchi
const NOW = new Date("2026-09-05T18:00:00.000Z");

function seed(over: { predictions?: Record<string, unknown>[]; enabled?: boolean } = {}) {
  return {
    rounds: [{ id: ROUND, season_id: SEASON, number: 1, name: "J1", status: "upcoming" }],
    fixtures: [
      { id: "f1", round_id: ROUND, locks_at: PASSE },
      { id: "f2", round_id: ROUND, locks_at: PASSE },
    ],
    scoring_rulesets: [{
      id: "rs1", season_id: SEASON, version: 1,
      effective_from: "2026-08-01T00:00:00.000Z", effective_to: null,
      rules: {
        points: { wrong: 0, winner: 1, winner_and_margin: 3, exact_score: 10 },
        margin_mode: "buckets",
        lock: { minutes_before_kickoff: 120 },
        default_prediction: {
          enabled: over.enabled ?? true, outcome: "home", margin_bucket: "median",
        },
      },
    }],
    margin_buckets: [
      { id: "b1", ruleset_id: "rs1", position: 1, min_points: 0, max_points: 5, label: "0-5" },
      { id: "b2", ruleset_id: "rs1", position: 2, min_points: 6, max_points: 10, label: "6-10" },
    ],
    // Deux joueurs actifs. La colonne est posée à plat : le faux client résout
    // « profiles.is_active » comme « is_active ».
    group_members: [
      { user_id: "u1", is_active: true },
      { user_id: "u2", is_active: true },
    ],
    predictions: over.predictions ?? [],
  };
}

describe("poser les pronostics par défaut", () => {
  test("un joueur qui n'a rien joué reçoit un pronostic", async () => {
    const fake = fakeSupabase(seed());
    const report = await applyDefaultPredictionsForRound(fake.client, ROUND, { now: NOW });

    assert.equal(report.defaultPredictionEnabled, true);
    assert.equal(report.lockedFixtures, 2);
    // Deux joueurs × deux matchs, aucun pronostic existant.
    assert.equal(report.created, 4, `reçu : ${JSON.stringify(report)}`);
  });

  test("les pronostics créés sont marqués comme automatiques", async () => {
    // `is_auto` distingue un oubli rattrapé d'un vrai choix : les statistiques
    // et le fil social s'appuient dessus.
    const fake = fakeSupabase(seed());
    await applyDefaultPredictionsForRound(fake.client, ROUND, { now: NOW });

    const posés = fake.inserted("predictions");
    assert.ok(posés.length > 0);
    assert.ok(posés.every((p) => p.is_auto === true), "tous doivent porter is_auto");
  });

  test("un joueur qui a déjà joué n'est pas écrasé", async () => {
    // Le point le plus sensible : poser un pronostic par-dessus un vrai choix
    // serait pire que de ne rien poser du tout.
    const fake = fakeSupabase(seed({
      predictions: [
        { id: "p1", user_id: "u1", fixture_id: "f1", outcome: "away", is_auto: false, locked_at: null },
      ],
    }));
    const report = await applyDefaultPredictionsForRound(fake.client, ROUND, { now: NOW });

    // Il manque : u1/f2, u2/f1, u2/f2 — soit trois, pas quatre.
    assert.equal(report.created, 3);
    const posés = fake.inserted("predictions");
    assert.ok(
      !posés.some((p) => p.user_id === "u1" && p.fixture_id === "f1"),
      "le pronostic existant ne doit pas être doublé",
    );
  });

  test("relancer l'opération ne crée rien de plus", async () => {
    // Le planificateur l'appelle à chaque passage : elle doit être rejouable.
    const fake = fakeSupabase(seed());
    const premier = await applyDefaultPredictionsForRound(fake.client, ROUND, { now: NOW });
    const second = await applyDefaultPredictionsForRound(fake.client, ROUND, { now: NOW });

    assert.equal(premier.created, 4);
    assert.equal(second.created, 0, "le second passage ne doit rien créer");
  });

  test("un barème qui refuse le pronostic par défaut est respecté", async () => {
    const fake = fakeSupabase(seed({ enabled: false }));
    const report = await applyDefaultPredictionsForRound(fake.client, ROUND, { now: NOW });

    assert.equal(report.defaultPredictionEnabled, false);
    assert.equal(report.created, 0);
    // Le verrouillage, lui, a bien eu lieu : il ne dépend pas de ce réglage.
    assert.equal(report.lockedFixtures, 2);
  });

  test("une journée dont l'heure n'est pas venue reste intacte", async () => {
    const data = seed();
    data.fixtures = data.fixtures.map((f) => ({ ...f, locks_at: "2026-09-06T12:00:00.000Z" }));
    const fake = fakeSupabase(data);

    const report = await applyDefaultPredictionsForRound(fake.client, ROUND, { now: NOW });
    assert.equal(report.lockedFixtures, 0);
    assert.equal(report.created, 0);
  });
});

describe("le point d'entrée du planificateur", () => {
  test("il trouve les journées dont l'heure est passée", async () => {
    // C'est cette fonction que la route /api/sync/lock appelle. Elle était
    // écrite, documentée « point d'entrée du planificateur », et n'était
    // appelée de nulle part.
    const fake = fakeSupabase(seed());
    const reports = await applyDefaultPredictionsForDueRounds(fake.client, { now: NOW });

    assert.equal(reports.length, 1);
    assert.equal(reports[0].roundId, ROUND);
    assert.equal(reports[0].created, 4);
  });

  test("aucune journée due : aucun rapport", async () => {
    const data = seed();
    data.fixtures = data.fixtures.map((f) => ({ ...f, locks_at: "2026-09-06T12:00:00.000Z" }));
    const fake = fakeSupabase(data);

    const reports = await applyDefaultPredictionsForDueRounds(fake.client, { now: NOW });
    assert.deepEqual(reports, []);
  });
});
