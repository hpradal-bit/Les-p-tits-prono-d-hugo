import { test, describe } from "node:test";
import assert from "node:assert/strict";
import webpush from "web-push";
import { derivePublicKey, describePair, isValidSubject, verifyPair } from "./keys.ts";

/**
 * Une paire dépareillée ne casse rien de visible : l'interrupteur s'allume,
 * l'abonnement s'enregistre, et c'est seulement à l'envoi qu'Apple répond 403
 * sans un mot d'explication. Ces tests garantissent qu'on nomme la cause
 * avant d'en arriver là.
 */

const pair = webpush.generateVAPIDKeys();
const other = webpush.generateVAPIDKeys();

describe("déduction de la clé publique", () => {
  test("une clé privée engendre bien sa publique", () => {
    assert.equal(derivePublicKey(pair.privateKey), pair.publicKey);
  });

  test("deux paires ne se mélangent pas", () => {
    assert.notEqual(derivePublicKey(pair.privateKey), other.publicKey);
  });

  test("une clé publique collée dans le mauvais champ est refusée", () => {
    // 65 octets au lieu de 32 : l'erreur de manipulation la plus courante.
    assert.equal(derivePublicKey(pair.publicKey), null);
  });

  test("ce qui n'est pas une clé est refusé", () => {
    assert.equal(derivePublicKey(""), null);
    assert.equal(derivePublicKey("   "), null);
    assert.equal(derivePublicKey("pas une clé du tout !"), null);
  });
});

describe("vérification de la paire", () => {
  test("une vraie paire est reconnue", () => {
    assert.equal(verifyPair(pair.publicKey, pair.privateKey), "ok");
  });

  test("deux moitiés de générations différentes sont démasquées", () => {
    assert.equal(verifyPair(other.publicKey, pair.privateKey), "mismatch");
  });

  test("une moitié absente se distingue d'une moitié fausse", () => {
    // Les deux mènent à « rien ne part », mais la réparation n'est pas la même.
    assert.equal(verifyPair("", pair.privateKey), "missing");
    assert.equal(verifyPair(pair.publicKey, ""), "missing");
    assert.equal(verifyPair(pair.publicKey, "abc"), "unreadable");
  });

  test("les espaces autour des clés ne cassent pas la paire", () => {
    // Un copier-coller depuis un terminal ramène presque toujours un retour
    // à la ligne : ce n'est pas une raison de déclarer la paire invalide.
    assert.equal(verifyPair(`\n${pair.publicKey} `, `  ${pair.privateKey}\n`), "ok");
  });

  test("chaque verdict a une explication", () => {
    for (const verdict of ["ok", "missing", "unreadable", "mismatch"] as const) {
      assert.ok(describePair(verdict).length > 10);
    }
  });
});

describe("sujet du jeton", () => {
  test("une adresse et une URL sont acceptées", () => {
    assert.ok(isValidSubject("mailto:hugo@example.com"));
    assert.ok(isValidSubject("https://pronos.example.com"));
  });

  test("ce qu'Apple refuse est refusé ici aussi", () => {
    assert.equal(isValidSubject("hugo@example.com"), false); // sans mailto:
    assert.equal(isValidSubject("http://pronos.example.com"), false); // pas https
    assert.equal(isValidSubject("mailto:hugo"), false);
    assert.equal(isValidSubject(""), false);
  });
});
