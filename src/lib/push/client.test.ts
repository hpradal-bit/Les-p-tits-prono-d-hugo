import { test, describe } from "node:test";
import assert from "node:assert/strict";
import webpush from "web-push";
import { matchesKey } from "./client.ts";

/**
 * Quand la paire VAPID change, les abonnements déjà posés deviennent muets
 * sans rien dire : l'interrupteur reste allumé, et le joueur croit être
 * joignable. C'est cette comparaison qui le détecte — et si elle se trompe
 * dans l'autre sens, elle détruit un abonnement parfaitement valide.
 */

const pair = webpush.generateVAPIDKeys();
const other = webpush.generateVAPIDKeys();

/** Les octets tels que le navigateur les range dans l'abonnement. */
function asApplied(base64url: string): ArrayBuffer {
  return Uint8Array.from(Buffer.from(base64url, "base64url")).buffer;
}

describe("clé d'un abonnement existant", () => {
  test("la même clé est reconnue", () => {
    assert.equal(matchesKey(asApplied(pair.publicKey), pair.publicKey), true);
  });

  test("une clé révolue est démasquée", () => {
    assert.equal(matchesKey(asApplied(other.publicKey), pair.publicKey), false);
  });

  test("un navigateur muet ne fait pas détruire l'abonnement", () => {
    // Safari n'a pas toujours exposé `applicationServerKey`. Sans information,
    // supprimer serait pire que garder : on ne conclut pas.
    assert.equal(matchesKey(null, pair.publicKey), true);
    assert.equal(matchesKey(undefined, pair.publicKey), true);
  });

  test("une clé tronquée ne passe pas pour la bonne", () => {
    const short = Uint8Array.from(Buffer.from(pair.publicKey, "base64url").subarray(0, 30)).buffer;
    assert.equal(matchesKey(short, pair.publicKey), false);
  });

  test("deux clés qui ne diffèrent que par le dernier octet sont distinguées", () => {
    const bytes = Buffer.from(pair.publicKey, "base64url");
    bytes[bytes.length - 1] ^= 0x01;
    assert.equal(matchesKey(Uint8Array.from(bytes).buffer, pair.publicKey), false);
  });
});
