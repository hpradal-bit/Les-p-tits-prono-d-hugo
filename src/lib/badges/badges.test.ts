import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluateBadges, statsFromProfiles, earnedKey } from "./engine.ts";
import type { BadgeDefinition, PlayerBadgeStats } from "./types.ts";
import { planStreakRows } from "../stats/persist.ts";
import type { PlayerStreaks } from "../stats/streaks.ts";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const ROUND_ID = "r-1";

function badge(code: string, rule: Record<string, unknown>): BadgeDefinition {
  return {
    id: `badge-${code}`,
    code,
    name: code,
    emoji: "🏅",
    description: null,
    rule: { type: "", ...rule },
    isActive: true,
  };
}

function stats(userId: string, overrides: Partial<PlayerBadgeStats> = {}): PlayerBadgeStats {
  return {
    userId,
    bestGoodStreak: 0,
    bestBadStreak: 0,
    exactScores: 0,
    roundsWon: 0,
    climb: 0,
    playedRound: true,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  evaluateBadges — les six types de la seed                                 */
/* -------------------------------------------------------------------------- */

describe("evaluateBadges", () => {
  test("machine (5 bons d'affilée) : décerné au seuil", () => {
    const b = badge("machine", { type: "streak", kind: "good_prediction", threshold: 5 });
    const s = [stats("alice", { bestGoodStreak: 5 }), stats("bob", { bestGoodStreak: 4 })];
    const { awards } = evaluateBadges({ badges: [b], stats: s, alreadyEarned: [] });
    assert.equal(awards.length, 1);
    assert.equal(awards[0].userId, "alice");
    assert.equal(awards[0].badgeCode, "machine");
  });

  test("en_feu (10 bons d'affilée) : décerné au seuil", () => {
    const b = badge("en_feu", { type: "streak", kind: "good_prediction", threshold: 10 });
    const s = [stats("alice", { bestGoodStreak: 10 })];
    const { awards } = evaluateBadges({ badges: [b], stats: s, alreadyEarned: [] });
    assert.equal(awards.length, 1);
    assert.equal(awards[0].badgeCode, "en_feu");
  });

  test("sniper (5 scores exacts) : décerné au seuil", () => {
    const b = badge("sniper", { type: "count", kind: "exact_score", threshold: 5 });
    const s = [stats("alice", { exactScores: 6 }), stats("bob", { exactScores: 3 })];
    const { awards } = evaluateBadges({ badges: [b], stats: s, alreadyEarned: [] });
    assert.equal(awards.length, 1);
    assert.equal(awards[0].userId, "alice");
  });

  test("spirale (5 mauvais d'affilée) : décerné au seuil", () => {
    const b = badge("spirale", { type: "streak", kind: "bad_prediction", threshold: 5 });
    const s = [stats("alice", { bestBadStreak: 5 })];
    const { awards } = evaluateBadges({ badges: [b], stats: s, alreadyEarned: [] });
    assert.equal(awards.length, 1);
    assert.equal(awards[0].badgeCode, "spirale");
  });

  test("patron (5 journées en tête) : décerné au seuil", () => {
    const b = badge("patron", { type: "count", kind: "round_won", threshold: 5 });
    const s = [stats("alice", { roundsWon: 5 }), stats("bob", { roundsWon: 4 })];
    const { awards } = evaluateBadges({ badges: [b], stats: s, alreadyEarned: [] });
    assert.equal(awards.length, 1);
    assert.equal(awards[0].userId, "alice");
  });

  test("remontada (meilleure progression) : le meilleur et lui seul", () => {
    const b = badge("remontada", { type: "superlative", kind: "biggest_climb", scope: "round" });
    const s = [
      stats("alice", { climb: 3 }),
      stats("bob", { climb: 1 }),
      stats("charlie", { climb: 0 }),
    ];
    const { awards } = evaluateBadges({ badges: [b], stats: s, alreadyEarned: [] });
    assert.equal(awards.length, 1);
    assert.equal(awards[0].userId, "alice");
  });

  test("remontada : les ex æquo sont tous récompensés", () => {
    const b = badge("remontada", { type: "superlative", kind: "biggest_climb", scope: "round" });
    const s = [
      stats("alice", { climb: 3 }),
      stats("bob", { climb: 3 }),
    ];
    const { awards } = evaluateBadges({ badges: [b], stats: s, alreadyEarned: [] });
    assert.equal(awards.length, 2);
  });

  test("remontada : un joueur qui n'a pas joué ne concourt pas", () => {
    const b = badge("remontada", { type: "superlative", kind: "biggest_climb", scope: "round" });
    const s = [
      stats("alice", { climb: 5, playedRound: false }),
      stats("bob", { climb: 2 }),
    ];
    const { awards } = evaluateBadges({ badges: [b], stats: s, alreadyEarned: [] });
    assert.equal(awards.length, 1);
    assert.equal(awards[0].userId, "bob");
  });

  test("badge déjà obtenu : pas de doublon", () => {
    const b = badge("machine", { type: "streak", kind: "good_prediction", threshold: 5 });
    const s = [stats("alice", { bestGoodStreak: 5 })];
    const { awards } = evaluateBadges({
      badges: [b],
      stats: s,
      alreadyEarned: [earnedKey("alice", "badge-machine")],
    });
    assert.equal(awards.length, 0);
  });

  test("badge inactif : ignoré", () => {
    const b = { ...badge("machine", { type: "streak", kind: "good_prediction", threshold: 5 }), isActive: false };
    const s = [stats("alice", { bestGoodStreak: 10 })];
    const { awards } = evaluateBadges({ badges: [b], stats: s, alreadyEarned: [] });
    assert.equal(awards.length, 0);
  });

  test("type de règle inconnu : noté dans skipped sans erreur", () => {
    const b = badge("mysterieux", { type: "alien_tech", threshold: 1 });
    const s = [stats("alice")];
    const { awards, skipped } = evaluateBadges({ badges: [b], stats: s, alreadyEarned: [] });
    assert.equal(awards.length, 0);
    assert.deepEqual(skipped, ["mysterieux"]);
  });

  test("plusieurs badges d'un coup", () => {
    const machine = badge("machine", { type: "streak", kind: "good_prediction", threshold: 5 });
    const sniper = badge("sniper", { type: "count", kind: "exact_score", threshold: 5 });
    const s = [stats("alice", { bestGoodStreak: 6, exactScores: 5 })];
    const { awards } = evaluateBadges({ badges: [machine, sniper], stats: s, alreadyEarned: [] });
    assert.equal(awards.length, 2);
    const codes = awards.map((a) => a.badgeCode).sort();
    assert.deepEqual(codes, ["machine", "sniper"]);
  });
});

/* -------------------------------------------------------------------------- */
/*  statsFromProfiles                                                        */
/* -------------------------------------------------------------------------- */

describe("statsFromProfiles", () => {
  test("extrait les mesures d'une fiche joueur", () => {
    const profile = {
      player: { userId: "alice" },
      exactScores: 3,
      roundsWon: 2,
      streaks: { good: { current: 1, best: 7 }, bad: { current: 0, best: 2 } },
      history: [
        { round: { id: ROUND_ID }, played: 5, movement: 3 },
      ],
    };
    const [s] = statsFromProfiles([profile], ROUND_ID);
    assert.equal(s.userId, "alice");
    assert.equal(s.bestGoodStreak, 7);
    assert.equal(s.bestBadStreak, 2);
    assert.equal(s.exactScores, 3);
    assert.equal(s.roundsWon, 2);
    assert.equal(s.climb, 3);
    assert.equal(s.playedRound, true);
  });

  test("joueur absent de la journée : playedRound faux, climb 0", () => {
    const profile = {
      player: { userId: "alice" },
      exactScores: 0,
      roundsWon: 0,
      streaks: { good: { current: 0, best: 0 }, bad: { current: 0, best: 0 } },
      history: [],
    };
    const [s] = statsFromProfiles([profile], ROUND_ID);
    assert.equal(s.playedRound, false);
    assert.equal(s.climb, 0);
  });
});

/* -------------------------------------------------------------------------- */
/*  planStreakRows — le pont entre les séries et la table `streaks`            */
/* -------------------------------------------------------------------------- */

describe("planStreakRows", () => {
  test("produit une ligne par nature de série non nulle", () => {
    const input: [string, PlayerStreaks][] = [
      ["alice", { good: { current: 3, best: 5 }, bad: { current: 0, best: 2 } }],
    ];
    const rows = planStreakRows(input, "season-1", "2026-09-05T20:00:00Z");
    assert.equal(rows.length, 2);
    assert.equal(rows[0].kind, "good_prediction");
    assert.equal(rows[0].current_value, 3);
    assert.equal(rows[0].best_value, 5);
    assert.equal(rows[1].kind, "bad_prediction");
    assert.equal(rows[1].current_value, 0);
    assert.equal(rows[1].best_value, 2);
  });

  test("série à zéro partout : pas de ligne", () => {
    const input: [string, PlayerStreaks][] = [
      ["alice", { good: { current: 0, best: 0 }, bad: { current: 0, best: 0 } }],
    ];
    const rows = planStreakRows(input, "season-1", "2026-09-05T20:00:00Z");
    assert.equal(rows.length, 0);
  });
});
