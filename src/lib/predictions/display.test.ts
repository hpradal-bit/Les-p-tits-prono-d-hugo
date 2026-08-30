import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hexToRgba,
  marginBucketSentence,
  outcomeSideLabel,
  outcomeWasCorrect,
  predictionBoxTint,
} from "./display.ts";
import type { MarginBucket, Team } from "../types.ts";

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: "t1",
    code: "XX",
    name: "Équipe",
    shortName: "Équipe",
    city: null,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    ...overrides,
  };
}

test("outcomeSideLabel : équipe à domicile", () => {
  assert.equal(outcomeSideLabel("home", "Castres", "Vannes"), "Castres");
});

test("outcomeSideLabel : équipe à l'extérieur", () => {
  assert.equal(outcomeSideLabel("away", "Castres", "Vannes"), "Vannes");
});

test("outcomeSideLabel : match nul", () => {
  assert.equal(outcomeSideLabel("draw", "Castres", "Vannes"), "Nul");
});

test("marginBucketSentence : tranche fermée", () => {
  const bucket: MarginBucket = { id: "b", position: 2, minPoints: 6, maxPoints: 10, label: "6-10" };
  assert.equal(marginBucketSentence(bucket), "6 à 10 points");
});

test("marginBucketSentence : tranche ouverte (41+)", () => {
  const bucket: MarginBucket = { id: "b", position: 9, minPoints: 41, maxPoints: null, label: "41+" };
  assert.equal(marginBucketSentence(bucket), "41 points ou plus");
});

test("marginBucketSentence : écart nul (0-0)", () => {
  const bucket: MarginBucket = { id: "b", position: 1, minPoints: 0, maxPoints: 0, label: "0" };
  assert.equal(marginBucketSentence(bucket), "0 point");
});

test("outcomeWasCorrect : vainqueur à domicile pronostiqué et confirmé", () => {
  assert.equal(outcomeWasCorrect("home", 24, 10), true);
});

test("outcomeWasCorrect : vainqueur pronostiqué mais match nul", () => {
  assert.equal(outcomeWasCorrect("home", 10, 10), false);
});

test("outcomeWasCorrect : indépendant du score exact — seul le vainqueur compte", () => {
  // Pronostic : Vannes gagnant. Résultat réel : Vannes gagne largement,
  // même si le score exact tenté était différent — le vainqueur reste juste.
  assert.equal(outcomeWasCorrect("away", 10, 15), true);
});

test("hexToRgba : conversion correcte", () => {
  assert.equal(hexToRgba("#E30613", 0.16), "rgba(227, 6, 19, 0.16)");
});

test("hexToRgba : accepte sans le dièse", () => {
  assert.equal(hexToRgba("E30613", 0.5), "rgba(227, 6, 19, 0.5)");
});

test("hexToRgba : rejette une valeur illisible", () => {
  assert.equal(hexToRgba("pas une couleur", 0.16), null);
});

test("predictionBoxTint : match terminé, pronostic gagnant → vert, jamais la couleur du club", () => {
  const home = makeTeam({ primaryColor: "#E30613" });
  const away = makeTeam({ primaryColor: "#009640" });
  const tint = predictionBoxTint("home", home, away, true);
  assert.equal(tint.background, "var(--winner-soft)");
  assert.equal(tint.dotColor, null);
});

test("predictionBoxTint : match terminé, pronostic perdant → rouge", () => {
  const home = makeTeam({ primaryColor: "#E30613" });
  const away = makeTeam({ primaryColor: "#009640" });
  const tint = predictionBoxTint("away", home, away, false);
  assert.equal(tint.background, "var(--wrong-soft)");
});

test("predictionBoxTint : match pas encore joué, club avec couleur → teinte du club", () => {
  const home = makeTeam({ primaryColor: "#E30613" });
  const away = makeTeam({ primaryColor: "#009640" });
  const tint = predictionBoxTint("home", home, away, null);
  assert.equal(tint.background, "rgba(227, 6, 19, 0.16)");
  assert.equal(tint.dotColor, "#E30613");
});

test("predictionBoxTint : match nul pronostiqué → neutre, pas de couleur de club", () => {
  const home = makeTeam({ primaryColor: "#E30613" });
  const away = makeTeam({ primaryColor: "#009640" });
  const tint = predictionBoxTint("draw", home, away, null);
  assert.equal(tint.background, "var(--surface-sunk)");
  assert.equal(tint.dotColor, null);
});

test("predictionBoxTint : club sans couleur enregistrée → neutre", () => {
  const home = makeTeam({ primaryColor: null });
  const away = makeTeam({ primaryColor: "#009640" });
  const tint = predictionBoxTint("home", home, away, null);
  assert.equal(tint.background, "var(--surface-sunk)");
  assert.equal(tint.dotColor, null);
});
