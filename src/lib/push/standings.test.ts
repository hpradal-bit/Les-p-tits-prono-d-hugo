import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { detectStandingsChanges, type StandingsSnapshot } from "./standings-detect.ts";

const names = new Map([
  ["u1", "Hugo"],
  ["u2", "Marco"],
  ["u3", "Pierre"],
  ["u4", "Lucas"],
]);

describe("detectStandingsChanges", () => {
  test("pas de changement → rien", () => {
    const before: StandingsSnapshot[] = [
      { userId: "u1", position: 1, points: 30 },
      { userId: "u2", position: 2, points: 20 },
      { userId: "u3", position: 3, points: 10 },
    ];
    const { leaderChange, overtakes } = detectStandingsChanges(before, before, names);
    assert.equal(leaderChange, null);
    assert.equal(overtakes.length, 0);
  });

  test("changement de leader", () => {
    const before: StandingsSnapshot[] = [
      { userId: "u1", position: 1, points: 30 },
      { userId: "u2", position: 2, points: 20 },
    ];
    const after: StandingsSnapshot[] = [
      { userId: "u2", position: 1, points: 35 },
      { userId: "u1", position: 2, points: 30 },
    ];
    const { leaderChange } = detectStandingsChanges(before, after, names);
    assert.ok(leaderChange);
    assert.equal(leaderChange.newLeaderId, "u2");
    assert.equal(leaderChange.newLeaderName, "Marco");
    assert.equal(leaderChange.previousLeaderId, "u1");
  });

  test("depassement simple", () => {
    const before: StandingsSnapshot[] = [
      { userId: "u1", position: 1, points: 30 },
      { userId: "u2", position: 2, points: 20 },
      { userId: "u3", position: 3, points: 10 },
    ];
    const after: StandingsSnapshot[] = [
      { userId: "u1", position: 1, points: 30 },
      { userId: "u3", position: 2, points: 25 },
      { userId: "u2", position: 3, points: 20 },
    ];
    const { leaderChange, overtakes } = detectStandingsChanges(before, after, names);
    assert.equal(leaderChange, null);
    assert.equal(overtakes.length, 1);
    assert.equal(overtakes[0].climberId, "u3");
    assert.equal(overtakes[0].overtakenId, "u2");
    assert.equal(overtakes[0].newPosition, 2);
  });

  test("changement de leader ET depassement", () => {
    const before: StandingsSnapshot[] = [
      { userId: "u1", position: 1, points: 30 },
      { userId: "u2", position: 2, points: 20 },
      { userId: "u3", position: 3, points: 10 },
    ];
    const after: StandingsSnapshot[] = [
      { userId: "u3", position: 1, points: 35 },
      { userId: "u1", position: 2, points: 30 },
      { userId: "u2", position: 3, points: 20 },
    ];
    const { leaderChange, overtakes } = detectStandingsChanges(before, after, names);
    assert.ok(leaderChange);
    assert.equal(leaderChange.newLeaderId, "u3");
    assert.equal(overtakes.length, 2);
    const ids = overtakes.map((o) => o.overtakenId).sort();
    assert.deepEqual(ids, ["u1", "u2"]);
  });

  test("ex aequo ne produit pas de depassement fantome", () => {
    const before: StandingsSnapshot[] = [
      { userId: "u1", position: 1, points: 30 },
      { userId: "u2", position: 2, points: 20 },
    ];
    const after: StandingsSnapshot[] = [
      { userId: "u1", position: 1, points: 30 },
      { userId: "u2", position: 1, points: 30 },
    ];
    const { leaderChange, overtakes } = detectStandingsChanges(before, after, names);
    assert.equal(leaderChange, null);
    assert.equal(overtakes.length, 0);
  });

  test("noms inconnus fallback", () => {
    const before: StandingsSnapshot[] = [
      { userId: "unknown1", position: 1, points: 30 },
      { userId: "unknown2", position: 2, points: 20 },
    ];
    const after: StandingsSnapshot[] = [
      { userId: "unknown2", position: 1, points: 35 },
      { userId: "unknown1", position: 2, points: 30 },
    ];
    const { leaderChange } = detectStandingsChanges(before, after, new Map());
    assert.ok(leaderChange);
    assert.equal(leaderChange.newLeaderName, "Quelqu'un");
  });
});
