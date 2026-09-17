import { test } from "node:test";
import assert from "node:assert/strict";
import { renderEvent, RENDERED_KINDS, type FeedEvent } from "./render.ts";

function ev(payload: Record<string, unknown>, extra: Partial<FeedEvent> = {}): FeedEvent {
  return {
    id: "e-1",
    kind: "power_resolved",
    actorName: "Pierre",
    targetName: null,
    payload,
    createdAt: "2026-09-12T20:00:00.000Z",
    ...extra,
  };
}

function resolved(
  code: string,
  outcome: Record<string, unknown>,
  extra: Partial<FeedEvent> = {},
): FeedEvent {
  return ev(
    { power_code: code, power_emoji: "⚡", power_name: code.toUpperCase(), outcome },
    extra,
  );
}

test("les deux types d'événements de pouvoir sont bien rendus par le fil", () => {
  // Le fil ne projette que les types présents dans RENDERED_KINDS : un type
  // absent disparaît en silence, sans erreur nulle part.
  assert.ok(RENDERED_KINDS.includes("power_declared"));
  assert.ok(RENDERED_KINDS.includes("power_resolved"));
});

// --- Déclaration ------------------------------------------------------------

test("déclaration : le joueur, le pouvoir, le match et le coût", () => {
  const r = renderEvent(
    ev(
      { power_emoji: "🛡️", power_name: "Joker", credit_cost: 5 },
      { kind: "power_declared", fixtureLabel: "Pau - Bayonne" },
    ),
  );
  assert.match(r!.text, /Pierre/);
  assert.match(r!.text, /Joker/);
  assert.match(r!.text, /Pau - Bayonne/);
  assert.match(r!.text, /5 cr\./);
});

// --- Joker et Oracle : gagné ou perdu ---------------------------------------

test("joker gagnant : le bonus et le match apparaissent", () => {
  const r = renderEvent(
    resolved("joker", { bonus: 3, fixtureId: "f1", basePoints: 3, multiplier: 2 }, {
      fixtureLabel: "Toulouse - Bordeaux",
    }),
  );
  assert.equal(r!.tone, "good");
  assert.match(r!.text, /3 points bonus/);
  assert.match(r!.text, /Toulouse - Bordeaux/);
});

test("joker perdu : dit explicitement qu'il est perdu", () => {
  // Le cas de Pierre : un Joker posé sur un match où il n'a rien marqué. Sans
  // cette ligne, le joueur croit que son pouvoir n'a pas été pris en compte.
  const r = renderEvent(
    resolved("joker", { bonus: 0, fixtureId: "f1", basePoints: 0, multiplier: 2 }, {
      fixtureLabel: "Vannes - Montpellier",
    }),
  );
  assert.equal(r!.tone, "bad");
  assert.match(r!.text, /perdu/);
  assert.match(r!.text, /Vannes - Montpellier/);
});

test("oracle gagnant : même traitement que le joker", () => {
  const r = renderEvent(
    resolved("oracle", { bonus: 2, fixtureId: "f1", basePoints: 4 }, {
      fixtureLabel: "Lyon - Clermont",
    }),
  );
  assert.equal(r!.tone, "good");
  assert.match(r!.text, /2 points bonus/);
});

// --- Sabotage ---------------------------------------------------------------

test("sabotage réussi : la cible et les points retirés", () => {
  const r = renderEvent(
    resolved("sabotage", { penalty: 3, targetId: "t", fixtureId: "f1", targetPoints: 5 }, {
      targetName: "Marc",
      fixtureLabel: "Castres - Vannes",
    }),
  );
  assert.equal(r!.tone, "gold");
  assert.match(r!.text, /Marc/);
  assert.match(r!.text, /3 points en moins/);
});

test("sabotage dans le vide : la cible n'avait rien marqué", () => {
  const r = renderEvent(
    resolved("sabotage", { penalty: 0, targetId: "t", fixtureId: "f1", targetPoints: 0 }, {
      targetName: "Marc",
    }),
  );
  assert.equal(r!.tone, "bad");
  assert.match(r!.text, /vide/);
});

// --- Espion -----------------------------------------------------------------

test("espion : l'usage se voit, même sans point déplacé", () => {
  // L'Espion ne bouge aucun point. Tant que l'événement n'était émis qu'en
  // présence d'ajustements, il disparaissait entièrement du fil.
  const r = renderEvent(
    resolved("spy", { revealed: true, targetId: "t", fixtureId: "f1" }, {
      targetName: "Benjamin",
      fixtureLabel: "Racing 92 - Lyon",
    }),
  );
  assert.match(r!.text, /espionné/);
  assert.match(r!.text, /Benjamin/);
  assert.match(r!.text, /Racing 92 - Lyon/);
});

// --- Duel : gagné ou perdu, du point de vue de celui qui a activé -----------

test("duel gagné par celui qui l'a lancé", () => {
  const r = renderEvent(
    resolved(
      "duel",
      { winnerId: "pierre", loserId: "marc", transferred: 8, initiatorPoints: 12, targetPoints: 8 },
      { targetName: "Marc", actorIsWinner: true },
    ),
  );
  assert.equal(r!.tone, "gold");
  assert.match(r!.text, /gagne/);
  assert.match(r!.text, /8 points raflés/);
});

test("duel perdu par celui qui l'a lancé", () => {
  const r = renderEvent(
    resolved(
      "duel",
      { winnerId: "marc", loserId: "pierre", transferred: 5, initiatorPoints: 5, targetPoints: 9 },
      { targetName: "Marc", actorIsWinner: false },
    ),
  );
  assert.equal(r!.tone, "bad");
  assert.match(r!.text, /perd/);
  assert.match(r!.text, /cédés à Marc/);
});

test("duel nul : aucun transfert", () => {
  const r = renderEvent(
    resolved("duel", { winner: null, initiatorPoints: 7, targetPoints: 7, tie: "no_transfer" }),
  );
  assert.match(r!.text, /égalité/);
});

// --- Robustesse sur l'historique déjà enregistré ----------------------------

test("un événement sans nom de match reste lisible", () => {
  // Les vingt événements déjà en base n'ont que des identifiants. Le rendu ne
  // doit ni planter ni afficher un UUID.
  const r = renderEvent(resolved("joker", { bonus: 1, fixtureId: "f1", basePoints: 1 }));
  assert.ok(r);
  assert.ok(!r!.text.includes("f1"));
  assert.match(r!.text, /1 point bonus/);
});

test("une issue vide ne casse pas le rendu", () => {
  const r = renderEvent(resolved("joker", {}));
  assert.ok(r);
  assert.ok(r!.text.length > 0);
});
