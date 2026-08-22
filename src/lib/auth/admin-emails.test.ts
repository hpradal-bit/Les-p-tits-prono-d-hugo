import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdminEmail } from "./admin-emails.ts";

function withEnv(value: string | undefined, fn: () => void) {
  const before = process.env.ADMIN_EMAILS;
  if (value === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = value;
  try { fn(); } finally {
    if (before === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = before;
  }
}

test("l'adresse déclarée obtient les droits d'admin", () => {
  withEnv("hugo@exemple.fr", () => {
    assert.equal(isAdminEmail("hugo@exemple.fr"), true);
  });
});

test("la casse et les espaces ne changent rien", () => {
  withEnv(" Hugo@Exemple.FR , marco@exemple.fr ", () => {
    assert.equal(isAdminEmail("HUGO@exemple.fr"), true);
    assert.equal(isAdminEmail("  marco@exemple.fr  "), true);
  });
});

test("les autres joueurs restent joueurs", () => {
  withEnv("hugo@exemple.fr", () => {
    assert.equal(isAdminEmail("marco@exemple.fr"), false);
  });
});

test("sans variable déclarée, personne n'est admin", () => {
  withEnv(undefined, () => {
    assert.equal(isAdminEmail("hugo@exemple.fr"), false);
  });
  withEnv("", () => {
    assert.equal(isAdminEmail("hugo@exemple.fr"), false);
  });
});

test("une adresse vide ne passe jamais", () => {
  withEnv("hugo@exemple.fr,,", () => {
    assert.equal(isAdminEmail(""), false);
    assert.equal(isAdminEmail("   "), false);
  });
});
