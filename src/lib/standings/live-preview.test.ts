import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStandings } from "./engine.ts";
import type { PlayerRef, RoundRef, ScoreEntry, StandingsInput } from "./engine.ts";
import { applyLivePreview } from "./live-preview.ts";

function player(id: string, firstName: string): PlayerRef {
  return { userId: id, firstName, displayName: firstName, avatarKind: "emoji", avatarValue: "🏉" };
}

const alice = player("u-alice", "Alice");
const bruno = player("u-bruno", "Bruno");
const chloe = player("u-chloe", "Chloé");
const players = [alice, bruno, chloe];
const rounds: RoundRef[] = [{ id: "r1", number: 1, name: "J1" }];

function entry(userId: string, points: number): ScoreEntry {
  return {
    userId,
    roundId: "r1",
    fixtureId: "f-officiel",
    kickoffAt: "2026-09-20T14:30:00Z",
    fixtureStatus: "official",
    points,
    level: points >= 10 ? "exact_score" : points > 0 ? "winner" : "wrong",
  };
}

function baseInput(entries: ScoreEntry[]): StandingsInput {
  return { players, rounds, entries, adjustments: [], bonuses: [] };
}

test("sans match en direct, applyLivePreview renvoie le classement tel quel", () => {
  const table = computeStandings(baseInput([entry("u-alice", 3), entry("u-bruno", 1)]), {
    kind: "overall",
    scope: "official",
  });
  const withPreview = applyLivePreview(table, []);

  assert.equal(withPreview.hasLivePreview, false);
  assert.deepEqual(
    withPreview.rows.map((r) => [r.player.userId, r.points]),
    table.rows.map((r) => [r.player.userId, r.points]),
  );
  for (const row of withPreview.rows) assert.equal(row.livePreviewPoints, 0);
});

test("l'aperçu en direct s'ajoute au total et peut changer le classement", () => {
  // Officiel : Alice 3, Bruno 1, Chloé 0 (Chloé dernière).
  const table = computeStandings(
    baseInput([entry("u-alice", 3), entry("u-bruno", 1), entry("u-chloe", 0)]),
    { kind: "overall", scope: "official" },
  );
  assert.equal(table.rows.find((r) => r.player.userId === "u-chloe")?.position, 3);

  // En direct, Chloé a un pronostic exact sur le match en cours : +10.
  const withPreview = applyLivePreview(table, [
    { userId: "u-chloe", fixtureId: "f-live", points: 10 },
  ]);

  assert.equal(withPreview.hasLivePreview, true);
  const chloeRow = withPreview.rows.find((r) => r.player.userId === "u-chloe")!;
  assert.equal(chloeRow.livePreviewPoints, 10);
  assert.equal(chloeRow.points, 10); // 0 officiel + 10 d'aperçu
  assert.equal(chloeRow.position, 1); // passe en tête, provisoirement

  // Le classement officiel sous-jacent, lui, n'a pas bougé.
  assert.equal(table.rows.find((r) => r.player.userId === "u-chloe")?.points, 0);
});

test("plusieurs matchs en direct pour un même joueur s'additionnent", () => {
  const table = computeStandings(baseInput([entry("u-alice", 0)]), {
    kind: "overall",
    scope: "official",
  });
  const withPreview = applyLivePreview(table, [
    { userId: "u-alice", fixtureId: "f-live-1", points: 3 },
    { userId: "u-alice", fixtureId: "f-live-2", points: 1 },
  ]);
  assert.equal(withPreview.rows.find((r) => r.player.userId === "u-alice")?.livePreviewPoints, 4);
});
