import { test } from "node:test";
import assert from "node:assert/strict";
import { applyToggle } from "./reactions.ts";

const BASE = [
  { emoji: "😂", count: 2, mine: false },
  { emoji: "🔥", count: 1, mine: true },
];

test("ajouter sa réaction incrémente et allume la pastille", () => {
  const next = applyToggle(BASE, "😂");
  assert.deepEqual(next[0], { emoji: "😂", count: 3, mine: true });
});

test("retirer sa réaction décrémente et éteint la pastille", () => {
  const next = applyToggle(BASE, "🔥");
  assert.deepEqual(next[1], { emoji: "🔥", count: 0, mine: false });
});

test("les autres réactions ne bougent pas", () => {
  assert.deepEqual(applyToggle(BASE, "😂")[1], BASE[1]);
});

test("un compteur ne descend jamais sous zéro", () => {
  const next = applyToggle([{ emoji: "🤡", count: 0, mine: true }], "🤡");
  assert.equal(next[0].count, 0);
});

test("un emoji absent de la liste ne casse rien", () => {
  assert.deepEqual(applyToggle(BASE, "👀"), BASE);
});
