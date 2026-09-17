import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuotas, maxUses, quotaRefusal, quotaLabel, FALLBACK_MAX_USES } from "./quota.ts";
import type { Power } from "./types.ts";

function power(id: string, code: string, config: Record<string, unknown> = {}): Power {
  return { id, code, name: code, emoji: "⚡", description: null, config, isActive: true };
}

test("le plafond vient de la config du pouvoir", () => {
  assert.equal(maxUses(power("p", "spy", { max_uses_per_player: 5 })), 5);
});

test("sans config, on retombe sur le réglage global", () => {
  assert.equal(maxUses(power("p", "spy")), FALLBACK_MAX_USES);
  assert.equal(maxUses(power("p", "spy"), 7), 7);
});

test("une valeur aberrante ne rend pas un pouvoir illimité", () => {
  assert.equal(maxUses(power("p", "spy", { max_uses_per_player: -2 }), 3), 3);
  assert.equal(maxUses(power("p", "spy", { max_uses_per_player: "trois" }), 3), 3);
});

test("un plafond à zéro est respecté : le pouvoir est désactivé", () => {
  assert.equal(maxUses(power("p", "spy", { max_uses_per_player: 0 })), 0);
});

test("le quota décompte les utilisations et calcule le restant", () => {
  const quotas = buildQuotas(
    [power("p1", "spy"), power("p2", "joker")],
    new Map([["p1", 2]]),
    3,
  );
  const spy = quotas.find((q) => q.code === "spy")!;
  assert.equal(spy.used, 2);
  assert.equal(spy.remaining, 1);
  assert.equal(spy.available, true);

  const joker = quotas.find((q) => q.code === "joker")!;
  assert.equal(joker.used, 0);
  assert.equal(joker.remaining, 3);
});

test("épuisé au dernier usage : plus disponible", () => {
  const [q] = buildQuotas([power("p1", "spy")], new Map([["p1", 3]]), 3);
  assert.equal(q.remaining, 0);
  assert.equal(q.available, false);
});

test("le restant ne descend jamais sous zéro, même si le plafond a baissé", () => {
  // Cas réel possible : l'admin abaisse le plafond après coup.
  const [q] = buildQuotas([power("p1", "spy")], new Map([["p1", 5]]), 3);
  assert.equal(q.remaining, 0);
  assert.equal(q.used, 5);
});

test("le refus explique pourquoi, sans jargon", () => {
  const [ok] = buildQuotas([power("p1", "spy")], new Map(), 3);
  assert.equal(quotaRefusal(ok, "Espion"), null);

  const [epuise] = buildQuotas([power("p1", "spy")], new Map([["p1", 3]]), 3);
  assert.match(quotaRefusal(epuise, "Espion")!, /déjà utilisé tes 3 Espion/);

  const [desactive] = buildQuotas([power("p1", "spy", { max_uses_per_player: 0 })], new Map(), 3);
  assert.match(quotaRefusal(desactive, "Espion")!, /désactivé/);
});

test("un pouvoir inconnu est refusé plutôt qu'autorisé par défaut", () => {
  assert.match(quotaRefusal(undefined, "Espion")!, /pas disponible/);
});

test("l'étiquette courte dit restant sur total", () => {
  const [q] = buildQuotas([power("p1", "spy")], new Map([["p1", 1]]), 3);
  assert.equal(quotaLabel(q), "2/3");
});
