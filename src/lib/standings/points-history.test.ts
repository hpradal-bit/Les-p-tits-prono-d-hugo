import { test } from "node:test";
import assert from "node:assert/strict";
import { accumulate, type RoundPoints } from "./points-history.ts";

function round(number: number, label: string, points: Record<string, number>): RoundPoints {
  return { roundNumber: number, roundLabel: label, byPlayer: new Map(Object.entries(points)) };
}

const PLAYERS = [
  { userId: "a", firstName: "Anne" },
  { userId: "b", firstName: "Bob" },
];

test("cumule les points journée après journée", () => {
  const history = accumulate(
    [round(1, "J1", { a: 5, b: 3 }), round(2, "J2", { a: 2, b: 8 })],
    PLAYERS,
  );
  assert.deepEqual(history.roundLabels, ["J1", "J2"]);
  const anne = history.players.find((p) => p.userId === "a")!;
  const bob = history.players.find((p) => p.userId === "b")!;
  assert.deepEqual(anne.cumulative, [5, 7]);
  assert.deepEqual(bob.cumulative, [3, 11]);
  assert.equal(history.maxPoints, 11);
});

test("remet les journées dans l'ordre même mal triées", () => {
  const history = accumulate(
    [round(2, "J2", { a: 4 }), round(1, "J1", { a: 1 })],
    [PLAYERS[0]],
  );
  assert.deepEqual(history.roundLabels, ["J1", "J2"]);
  assert.deepEqual(history.players[0].cumulative, [1, 5]);
});

test("un joueur absent d'une journée garde son total", () => {
  const history = accumulate(
    [round(1, "J1", { a: 5, b: 3 }), round(2, "J2", { a: 2 })],
    PLAYERS,
  );
  assert.deepEqual(history.players.find((p) => p.userId === "b")!.cumulative, [3, 3]);
});

test("aucune ligne à plat avant la première apparition", () => {
  const history = accumulate(
    [round(1, "J1", { a: 5 }), round(2, "J2", { a: 1, b: 4 })],
    PLAYERS,
  );
  assert.deepEqual(history.players.find((p) => p.userId === "b")!.cumulative, [null, 4]);
});

test("les points négatifs (sabotage) font redescendre la courbe", () => {
  const history = accumulate([round(1, "J1", { a: 6 }), round(2, "J2", { a: -2 })], [PLAYERS[0]]);
  assert.deepEqual(history.players[0].cumulative, [6, 4]);
  assert.equal(history.maxPoints, 6);
});

test("la légende se lit comme le classement : le meilleur en premier", () => {
  const history = accumulate([round(1, "J1", { a: 3, b: 9 })], PLAYERS);
  assert.deepEqual(history.players.map((p) => p.firstName), ["Bob", "Anne"]);
});

test("sans journée jouée, le graphique n'a rien à tracer", () => {
  const history = accumulate([], PLAYERS);
  assert.deepEqual(history.roundLabels, []);
  assert.equal(history.maxPoints, 0);
  assert.deepEqual(history.players.map((p) => p.cumulative), [[], []]);
});
