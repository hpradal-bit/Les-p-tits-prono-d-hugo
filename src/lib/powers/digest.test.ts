import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildPowerDigest } from "./digest.ts";
import type { PowerUsage } from "./types.ts";
import type { PlayerRef } from "@/lib/standings/engine";

function usage(overrides: Partial<PowerUsage>): PowerUsage {
  return {
    id: "usage-1",
    tokenId: "",
    powerId: "power-duel",
    powerCode: "duel",
    initiatorId: "hugo",
    targetId: "pierre",
    roundId: "round-1",
    state: "declared",
    snapshotBefore: {},
    result: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    ...overrides,
  };
}

function player(userId: string, displayName: string): PlayerRef {
  return { userId, firstName: displayName, displayName, avatarKind: "emoji", avatarValue: "🏉" };
}

const playersById = new Map([
  ["hugo", player("hugo", "Hugo")],
  ["pierre", player("pierre", "Pierre")],
]);

const powersById = new Map([
  ["power-duel", { emoji: "⚔️", name: "Duel", effect: null }],
  ["power-oracle", { emoji: "🔮", name: "Oracle", effect: "Double tes points si tu trouves le score exact." }],
]);

describe("buildPowerDigest", () => {
  test("un pouvoir vise un joueur : carte auteur -> cible, avec legende", () => {
    const items = buildPowerDigest({
      usages: [usage({})],
      powersById,
      playersById,
      fixturesById: new Map(),
      roundFirstKickoffAt: "2026-09-01T00:00:00Z",
      now: new Date("2026-09-02T00:00:00Z"),
    });

    assert.equal(items.length, 1);
    assert.equal(items[0].initiator.displayName, "Hugo");
    assert.equal(items[0].target?.displayName, "Pierre");
    assert.equal(items[0].caption, "Hugo a lancé un Duel sur Pierre");
  });

  test("un pouvoir sans cible (Oracle) : pas de fleche, juste l'auteur et l'effet", () => {
    const items = buildPowerDigest({
      usages: [
        usage({
          id: "usage-2",
          powerId: "power-oracle",
          powerCode: "oracle",
          targetId: null,
          snapshotBefore: { fixtureId: "f1" },
        }),
      ],
      powersById,
      playersById,
      fixturesById: new Map([["f1", { kickoffAt: "2026-09-01T00:00:00Z", label: "ST - UBB" }]]),
      roundFirstKickoffAt: "2026-09-01T00:00:00Z",
      now: new Date("2026-09-02T00:00:00Z"),
    });

    assert.equal(items.length, 1);
    assert.equal(items[0].target, null);
    assert.equal(items[0].caption, "Hugo a utilisé Oracle");
    assert.equal(items[0].fixtureLabel, "ST - UBB");
    assert.equal(items[0].effect, "Double tes points si tu trouves le score exact.");
  });

  test("avant le coup d'envoi du match vise, le pouvoir reste cache (meme regle que le Fil)", () => {
    const items = buildPowerDigest({
      usages: [
        usage({
          id: "usage-3",
          powerId: "power-oracle",
          powerCode: "oracle",
          targetId: null,
          snapshotBefore: { fixtureId: "f1" },
        }),
      ],
      powersById,
      playersById,
      fixturesById: new Map([["f1", { kickoffAt: "2026-09-05T18:00:00Z", label: "ST - UBB" }]]),
      roundFirstKickoffAt: "2026-09-01T00:00:00Z",
      now: new Date("2026-09-01T00:00:00Z"),
    });
    assert.equal(items.length, 0);
  });

  test("un Duel (sans match propre) se revele au premier coup d'envoi de la journee", () => {
    const beforeKickoff = buildPowerDigest({
      usages: [usage({})],
      powersById,
      playersById,
      fixturesById: new Map(),
      roundFirstKickoffAt: "2026-09-05T18:00:00Z",
      now: new Date("2026-09-05T17:00:00Z"),
    });
    assert.equal(beforeKickoff.length, 0);

    const afterKickoff = buildPowerDigest({
      usages: [usage({})],
      powersById,
      playersById,
      fixturesById: new Map(),
      roundFirstKickoffAt: "2026-09-05T18:00:00Z",
      now: new Date("2026-09-05T19:00:00Z"),
    });
    assert.equal(afterKickoff.length, 1);
  });

  test("un pouvoir inconnu ou un joueur introuvable est ignore sans faire echouer le reste", () => {
    const items = buildPowerDigest({
      usages: [usage({ powerId: "power-inconnu" }), usage({ id: "usage-4", initiatorId: "fantome" })],
      powersById,
      playersById,
      fixturesById: new Map(),
      roundFirstKickoffAt: null,
      now: new Date(),
    });
    assert.equal(items.length, 0);
  });
});
