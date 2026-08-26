import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateJoinKey } from "./keys.ts";

describe("generateJoinKey", () => {
  it("produit une clé de 6 caractères", () => {
    assert.equal(generateJoinKey().length, 6);
  });

  it("n'utilise que des caractères non ambigus", () => {
    const forbidden = /[01OI]/;
    for (let i = 0; i < 200; i++) {
      const key = generateJoinKey();
      assert.equal(forbidden.test(key), false, `clé suspecte : ${key}`);
    }
  });

  it("ne produit que des majuscules et des chiffres", () => {
    for (let i = 0; i < 50; i++) {
      assert.match(generateJoinKey(), /^[A-Z0-9]{6}$/);
    }
  });

  it("varie d'un appel à l'autre", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateJoinKey()));
    // 50 tirages sur ~1 milliard de combinaisons : une collision serait suspecte.
    assert.ok(keys.size > 40, "les clés générées se ressemblent trop");
  });
});
