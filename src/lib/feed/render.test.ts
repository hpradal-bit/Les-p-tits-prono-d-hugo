import { test } from "node:test";
import assert from "node:assert/strict";
import { renderEvent, fillSummary, RENDERED_KINDS, type FeedEvent } from "./render.ts";

function ev(kind: string, extra: Partial<FeedEvent> = {}): FeedEvent {
  return {
    id: "e1", kind, actorName: "Hugo", targetName: null,
    payload: {}, createdAt: "2026-09-05T20:00:00Z", ...extra,
  };
}

test("un score exact est raconté avec son score", () => {
  const r = renderEvent(ev("exact_score", { payload: { home_score: 24, away_score: 12 } }));
  assert.equal(r?.emoji, "👌");
  assert.equal(r?.tone, "gold");
  assert.match(r!.text, /Hugo place un score exact \(24-12\)\. \+10\./);
});

test("un score exact sans score reste lisible", () => {
  const r = renderEvent(ev("exact_score"));
  assert.equal(r?.text, "Hugo place un score exact. +10.");
});

test("un dépassement nomme les deux joueurs", () => {
  const r = renderEvent(ev("overtake", { actorName: "Marco", targetName: "Pierre" }));
  assert.equal(r?.text, "Marco vient de doubler Pierre.");
});

test("le pluriel est respecté", () => {
  assert.match(renderEvent(ev("bad_streak", { payload: { length: 1 } }))!.text, /1 prono raté d'affilée/);
  assert.match(renderEvent(ev("bad_streak", { payload: { length: 5 } }))!.text, /5 pronos ratés d'affilée/);
});

test("le verrouillage mentionne les pronos automatiques, s'il y en a", () => {
  const avec = renderEvent(ev("round_locked", { payload: { round_name: "J1", auto_predictions: 3 } }));
  assert.match(avec!.text, /J1 est verrouillée\. 3 pronos ont été joués automatiquement\./);
  const sans = renderEvent(ev("round_locked", { payload: { round_name: "J1" } }));
  assert.equal(sans!.text, "J1 est verrouillée.");
});

test("un match terminé affiche le score", () => {
  const r = renderEvent(ev("fixture_finished", {
    payload: { homeTeam: "Toulouse", awayTeam: "Clermont", homeScore: 31, awayScore: 17 },
  }));
  assert.equal(r?.emoji, "🏉");
  assert.equal(r?.tone, "neutral");
  assert.equal(r!.text, "Coup de sifflet final : Toulouse 31-17 Clermont.");
});

test("un match terminé sans noms reste lisible", () => {
  const r = renderEvent(ev("fixture_finished", {
    payload: { homeScore: 10, awayScore: 10 },
  }));
  assert.equal(r!.text, "Coup de sifflet final : Domicile 10-10 Extérieur.");
});

test("un match terminé avec repartition affiche le debrief complet", () => {
  const r = renderEvent(ev("fixture_finished", {
    payload: {
      homeTeam: "Castres", awayTeam: "Vannes", homeScore: 24, awayScore: 18,
      onHome: 12, onAway: 5, onDraw: 3, exactNames: ["Hugo"],
    },
  }));
  assert.match(r!.text, /Debrief Castres - Vannes/);
  assert.match(r!.text, /12 joueurs avaient choisi Castres/);
  assert.match(r!.text, /5 joueurs avaient choisi Vannes/);
  assert.match(r!.text, /3 joueurs avaient choisi le nul/);
  assert.match(r!.text, /Score exact : Hugo 🎯/);
});

test("une action d'arbitre affiche sa raison", () => {
  const r = renderEvent(ev("admin_action", { payload: { reason: "erreur de l'API, score officiel LNR" } }));
  assert.match(r!.text, /Intervention de l'arbitre — erreur de l'API/);
});

test("un événement inconnu ne produit rien plutôt qu'une phrase vide", () => {
  assert.equal(renderEvent(ev("quelque_chose_de_nouveau")), null);
});

test("un joueur sans nom ne casse aucune phrase", () => {
  for (const kind of RENDERED_KINDS) {
    const r = renderEvent(ev(kind, { actorName: null, targetName: null }));
    assert.ok(r === null || (r.text.length > 0 && !r.text.includes("null")), kind);
  }
});

// --- Résumé de journée -------------------------------------------------------

const template = [
  "🏉 JOURNÉE {n} TERMINÉE",
  "{leader} prend la première place avec {pts} points.",
  "{chute} chute de la {avant}e à la {apres}e place.",
];

test("le gabarit se remplit avec les valeurs fournies", () => {
  const lines = fillSummary(template, { n: 5, leader: "Hugo", pts: 42, chute: "Pierre", avant: 3, apres: 5 });
  assert.equal(lines.length, 3);
  assert.equal(lines[1], "Hugo prend la première place avec 42 points.");
});

test("une ligne dont un trou manque est omise, pas rendue à moitié", () => {
  const lines = fillSummary(template, { n: 5, leader: "Hugo", pts: 42, chute: null, avant: 3, apres: 5 });
  assert.equal(lines.length, 2);
  assert.ok(!lines.some((l) => l.includes("{") || l.includes("null")));
});

test("un gabarit vide ne produit rien", () => {
  assert.deepEqual(fillSummary([], { n: 1 }), []);
});
