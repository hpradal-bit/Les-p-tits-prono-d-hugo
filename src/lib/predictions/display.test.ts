import { test } from "node:test";
import assert from "node:assert/strict";
import { marginBucketSentence, outcomeSideLabel, outcomeWasCorrect } from "./display.ts";
import type { MarginBucket } from "../types.ts";

test("outcomeSideLabel : équipe à domicile", () => {
  assert.equal(outcomeSideLabel("home", "Castres", "Vannes"), "Castres");
});

test("outcomeSideLabel : équipe à l'extérieur", () => {
  assert.equal(outcomeSideLabel("away", "Castres", "Vannes"), "Vannes");
});

test("outcomeSideLabel : match nul", () => {
  assert.equal(outcomeSideLabel("draw", "Castres", "Vannes"), "Nul");
});

test("marginBucketSentence : tranche fermée", () => {
  const bucket: MarginBucket = { id: "b", position: 2, minPoints: 6, maxPoints: 10, label: "6-10" };
  assert.equal(marginBucketSentence(bucket), "6 à 10 points");
});

test("marginBucketSentence : tranche ouverte (41+)", () => {
  const bucket: MarginBucket = { id: "b", position: 9, minPoints: 41, maxPoints: null, label: "41+" };
  assert.equal(marginBucketSentence(bucket), "41 points ou plus");
});

test("marginBucketSentence : écart nul (0-0)", () => {
  const bucket: MarginBucket = { id: "b", position: 1, minPoints: 0, maxPoints: 0, label: "0" };
  assert.equal(marginBucketSentence(bucket), "0 point");
});

test("outcomeWasCorrect : vainqueur à domicile pronostiqué et confirmé", () => {
  assert.equal(outcomeWasCorrect("home", 24, 10), true);
});

test("outcomeWasCorrect : vainqueur pronostiqué mais match nul", () => {
  assert.equal(outcomeWasCorrect("home", 10, 10), false);
});

test("outcomeWasCorrect : indépendant du score exact — seul le vainqueur compte", () => {
  // Pronostic : Vannes gagnant. Résultat réel : Vannes gagne largement,
  // même si le score exact tenté était différent — le vainqueur reste juste.
  assert.equal(outcomeWasCorrect("away", 10, 15), true);
});
