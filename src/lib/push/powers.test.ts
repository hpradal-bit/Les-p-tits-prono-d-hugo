import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildPowerDeclaredNotification, POWER_DECLARED_KIND } from "./powers.ts";

describe("buildPowerDeclaredNotification", () => {
  test("titre et emoji generalises, jamais un texte par pouvoir code en dur", () => {
    const req = buildPowerDeclaredNotification("pierre-id", {
      usageId: "usage-1",
      powerEmoji: "⚔️",
      powerName: "Duel",
      powerEffect: null,
      initiatorName: "Hugo",
    });

    assert.equal(req.userId, "pierre-id");
    assert.equal(req.kind, POWER_DECLARED_KIND);
    assert.equal(req.title, "⚔️ Hugo a lancé un Duel contre toi !");
    assert.equal(req.url, "/journee");
  });

  test("meme fonction pour un autre pouvoir cible, sans aucune branche par code", () => {
    const req = buildPowerDeclaredNotification("pierre-id", {
      usageId: "usage-2",
      powerEmoji: "🕵️",
      powerName: "Espion",
      powerEffect: null,
      initiatorName: "Marco",
    });

    assert.equal(req.title, "🕵️ Marco a lancé un Espion contre toi !");
  });

  test("reutilise l'effet deja ecrit pour l'admin, au lieu d'un texte invente", () => {
    const req = buildPowerDeclaredNotification("pierre-id", {
      usageId: "usage-3",
      powerEmoji: "💣",
      powerName: "Sabotage",
      powerEffect: "Le pronostic de ta cible sur ce match perd la moitié de ses points.",
      initiatorName: "Lucas",
    });

    assert.equal(req.body, "Le pronostic de ta cible sur ce match perd la moitié de ses points.");
  });

  test("sans effet configure, un corps de repli generique", () => {
    const req = buildPowerDeclaredNotification("pierre-id", {
      usageId: "usage-4",
      powerEmoji: "⚔️",
      powerName: "Duel",
      powerEffect: null,
      initiatorName: "Hugo",
    });

    assert.equal(req.body, "Hugo a activé son pouvoir Duel contre toi sur cette journée.");
  });

  test("la cle de dedoublonnage est par utilisation : un meme usage ne part jamais deux fois", () => {
    const a = buildPowerDeclaredNotification("pierre-id", {
      usageId: "usage-5",
      powerEmoji: "⚔️",
      powerName: "Duel",
      powerEffect: null,
      initiatorName: "Hugo",
    });
    const b = buildPowerDeclaredNotification("pierre-id", {
      usageId: "usage-5",
      powerEmoji: "⚔️",
      powerName: "Duel",
      powerEffect: null,
      initiatorName: "Hugo",
    });
    assert.equal(a.dedupeKey, b.dedupeKey);

    const c = buildPowerDeclaredNotification("pierre-id", {
      usageId: "usage-6",
      powerEmoji: "⚔️",
      powerName: "Duel",
      powerEffect: null,
      initiatorName: "Hugo",
    });
    assert.notEqual(a.dedupeKey, c.dedupeKey);
  });
});
