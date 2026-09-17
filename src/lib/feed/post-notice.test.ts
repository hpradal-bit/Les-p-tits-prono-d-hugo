import { test } from "node:test";
import assert from "node:assert/strict";
import { excerpt, postTitle, EXCERPT_MAX } from "./post-notice.ts";

test("un message court passe tel quel", () => {
  assert.equal(excerpt("Vero enculé"), "Vero enculé");
});

test("les retours à la ligne deviennent des espaces", () => {
  assert.equal(excerpt("Allez\n\nles   petits"), "Allez les petits");
});

test("un message long est coupé sur un mot entier", () => {
  const long = "Toulouse va leur mettre une fessée ".repeat(10);
  const short = excerpt(long);
  assert.ok(short.length <= EXCERPT_MAX + 1, short.length.toString());
  assert.ok(short.endsWith("…"));
  assert.ok(!short.includes("  "));
  // Coupé sur un espace : le dernier mot n'est pas tronqué au milieu.
  assert.ok(long.startsWith(short.slice(0, -1)));
});

test("un mot unique interminable est coupé net plutôt que perdu", () => {
  const mot = "a".repeat(300);
  const short = excerpt(mot);
  assert.equal(short, `${"a".repeat(EXCERPT_MAX)}…`);
});

test("un message vide ne produit pas d'extrait bancal", () => {
  assert.equal(excerpt("   "), "");
});

test("le titre porte le surnom de l'auteur", () => {
  assert.equal(postTitle("L’express"), "💬 L’express a écrit");
});
