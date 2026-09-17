import { test } from "node:test";
import assert from "node:assert/strict";
import { powerVerdict } from "./verdict.ts";

/**
 * Chaque pouvoir a sa propre notion de réussite, et elle ne se lit pas sur le
 * seul signe des points : l'Espion ne déplace rien et réussit, le Sabotage
 * réussit en faisant perdre des points à quelqu'un d'autre.
 */

test("un pouvoir non résolu est en attente, sans verdict hâtif", () => {
  const r = powerVerdict("joker", "declared", null);
  assert.equal(r.verdict, "attente");
  assert.equal(r.delta, null);
});

test("un pouvoir annulé dit que les crédits sont revenus", () => {
  const r = powerVerdict("joker", "cancelled", null);
  assert.equal(r.verdict, "neutre");
  assert.match(r.detail, /restitué/);
});

test("joker avec bonus : gagné, et le gain est chiffré", () => {
  const r = powerVerdict("joker", "resolved", { bonus: 3, basePoints: 3 });
  assert.equal(r.verdict, "gagne");
  assert.equal(r.delta, 3);
  assert.match(r.detail, /\+3 pts/);
});

test("joker sans bonus : perdu, avec la raison", () => {
  // Le cas de Pierre : un Joker sur un match où il n'a rien marqué.
  const r = powerVerdict("joker", "resolved", { bonus: 0, basePoints: 0 });
  assert.equal(r.verdict, "perdu");
  assert.match(r.detail, /aucun point marqué/);
});

test("oracle suit la même règle que le joker", () => {
  assert.equal(powerVerdict("oracle", "resolved", { bonus: 2 }).verdict, "gagne");
  assert.equal(powerVerdict("oracle", "resolved", { bonus: 0 }).verdict, "perdu");
});

test("espion : réussi sans déplacer un seul point", () => {
  const r = powerVerdict("spy", "resolved", { revealed: true }, { targetName: "Marc" });
  assert.equal(r.verdict, "gagne");
  assert.equal(r.delta, 0);
  assert.match(r.detail, /Marc/);
});

test("sabotage réussi : la cible perd des points, pas l'auteur", () => {
  const r = powerVerdict("sabotage", "resolved", { penalty: 3 }, { targetName: "Pierre" });
  assert.equal(r.verdict, "gagne");
  // L'auteur ne gagne rien lui-même : son delta reste nul.
  assert.equal(r.delta, 0);
  assert.match(r.detail, /3 pts retirés à Pierre/);
});

test("sabotage dans le vide : perdu", () => {
  const r = powerVerdict("sabotage", "resolved", { penalty: 0 });
  assert.equal(r.verdict, "perdu");
});

test("duel gagné par l'auteur", () => {
  const r = powerVerdict(
    "duel", "resolved",
    { winnerId: "pierre", transferred: 8 },
    { actorIsWinner: true, targetName: "Marc" },
  );
  assert.equal(r.verdict, "gagne");
  assert.equal(r.delta, 8);
  assert.match(r.detail, /raflés à Marc/);
});

test("duel perdu par l'auteur : le delta est négatif", () => {
  const r = powerVerdict(
    "duel", "resolved",
    { winnerId: "marc", transferred: 5 },
    { actorIsWinner: false, targetName: "Marc" },
  );
  assert.equal(r.verdict, "perdu");
  assert.equal(r.delta, -5);
});

test("duel nul : ni gagné ni perdu", () => {
  const r = powerVerdict("duel", "resolved", { winner: null, initiatorPoints: 7, targetPoints: 7 });
  assert.equal(r.verdict, "neutre");
  assert.match(r.detail, /égalité/);
});

test("une issue illisible ne produit jamais un faux verdict", () => {
  const r = powerVerdict("joker", "resolved", {});
  assert.equal(r.verdict, "neutre");
  assert.equal(r.delta, null);
});

test("une issue en erreur est sans effet, pas « gagné »", () => {
  const r = powerVerdict("oracle", "resolved", { error: "no_fixture" });
  assert.equal(r.verdict, "neutre");
});
