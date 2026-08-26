/**
 * Génération de la clé d'invitation d'une ligue.
 *
 * Pure, sans accès base : 6 caractères, alphabet sans caractères ambigus
 * (`0`/`O`, `1`/`I`) pour rester lisible dictée à voix haute ou recopiée à la
 * main. `join_key` est `citext` en base — la casse n'a pas à être exacte.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LENGTH = 6;

export function generateJoinKey(): string {
  let key = "";
  for (let i = 0; i < LENGTH; i++) {
    key += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return key;
}
