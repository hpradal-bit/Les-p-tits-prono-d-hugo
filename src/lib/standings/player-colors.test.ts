import { test } from "node:test";
import assert from "node:assert/strict";
import { assignPlayerColors, playerColor, PLAYER_COLORS } from "./player-colors.ts";

test("deux joueurs n'ont jamais la même couleur", () => {
  const colors = assignPlayerColors(["a", "b", "c", "d", "e", "f"]);
  assert.equal(new Set(colors.values()).size, 6);
});

test("la couleur ne dépend pas de l'ordre d'affichage", () => {
  const parPlace = assignPlayerColors(["c", "a", "b"]);
  const parPoints = assignPlayerColors(["b", "c", "a"]);
  for (const id of ["a", "b", "c"]) {
    assert.equal(parPlace.get(id), parPoints.get(id));
  }
});

test("un doublon ne consomme pas deux teintes", () => {
  const colors = assignPlayerColors(["a", "a", "b"]);
  assert.equal(colors.size, 2);
  assert.notEqual(colors.get("a"), colors.get("b"));
});

test("au-delà de la palette, on recommence plutôt que de rendre undefined", () => {
  const ids = Array.from({ length: PLAYER_COLORS.length + 2 }, (_, i) => `j${i}`);
  const colors = assignPlayerColors(ids);
  for (const id of ids) assert.ok(colors.get(id));
});

test("un joueur inconnu reçoit une couleur plutôt que rien", () => {
  assert.equal(playerColor(new Map(), "fantome"), PLAYER_COLORS[0]);
});
