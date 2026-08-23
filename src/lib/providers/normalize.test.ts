import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAliasIndex,
  matchTeam,
  normalizeName,
  significantTokens,
  type TeamCandidate,
} from "./normalize.ts";

/** Les 14 clubs du Top 14 2026/2027, tels qu'ils sont en base (migration 0005). */
const top14: TeamCandidate[] = [
  { id: "t-bay", code: "BAY", name: "Aviron Bayonnais", shortName: "Bayonne", city: "Bayonne" },
  { id: "t-ubb", code: "UBB", name: "Union Bordeaux-Bègles", shortName: "Bordeaux-Bègles", city: "Bordeaux" },
  { id: "t-co", code: "CO", name: "Castres Olympique", shortName: "Castres", city: "Castres" },
  { id: "t-asm", code: "ASM", name: "ASM Clermont Auvergne", shortName: "Clermont", city: "Clermont-Ferrand" },
  { id: "t-sr", code: "SR", name: "Stade Rochelais", shortName: "La Rochelle", city: "La Rochelle" },
  { id: "t-lou", code: "LOU", name: "LOU Rugby", shortName: "Lyon", city: "Lyon" },
  { id: "t-mhr", code: "MHR", name: "Montpellier Hérault Rugby", shortName: "Montpellier", city: "Montpellier" },
  { id: "t-sp", code: "SP", name: "Section Paloise", shortName: "Pau", city: "Pau" },
  { id: "t-usap", code: "USAP", name: "USA Perpignan", shortName: "Perpignan", city: "Perpignan" },
  { id: "t-r92", code: "R92", name: "Racing 92", shortName: "Racing 92", city: "Nanterre" },
  { id: "t-sfp", code: "SFP", name: "Stade Français Paris", shortName: "Stade Français", city: "Paris" },
  { id: "t-rct", code: "RCT", name: "RC Toulon", shortName: "Toulon", city: "Toulon" },
  { id: "t-st", code: "ST", name: "Stade Toulousain", shortName: "Toulouse", city: "Toulouse" },
  { id: "t-rcv", code: "RCV", name: "RC Vannes", shortName: "Vannes", city: "Vannes" },
];

test("normalisation : accents, ponctuation et casse disparaissent", () => {
  assert.equal(normalizeName("Union Bordeaux-Bègles"), "union bordeaux begles");
  assert.equal(normalizeName("ASM Clermont Auvergne"), "asm clermont auvergne");
  assert.equal(normalizeName("  Stade   Français  "), "stade francais");
  assert.equal(normalizeName("RC Toulon"), "rc toulon");
});

test("normalisation : les mots génériques ne servent pas à distinguer", () => {
  assert.deepEqual(significantTokens("LOU Rugby"), ["lou"]);
  assert.deepEqual(significantTokens("Castres Olympique"), ["castres"]);
  // Un nom entièrement générique garde ses mots plutôt que de devenir vide.
  assert.deepEqual(significantTokens("RC"), ["rc"]);
});

// --- Les noms que les fournisseurs emploient réellement ---------------------

const providerNames: [string, string][] = [
  ["Stade Toulousain", "t-st"],
  ["Toulouse", "t-st"],
  ["ASM Clermont Auvergne", "t-asm"],
  ["Clermont Auvergne", "t-asm"],
  ["Clermont", "t-asm"],
  ["Union Bordeaux Begles", "t-ubb"],
  ["Bordeaux Bègles", "t-ubb"],
  ["Racing 92", "t-r92"],
  ["Stade Francais Paris", "t-sfp"],
  ["Stade Français", "t-sfp"],
  ["RC Toulon", "t-rct"],
  ["Toulon", "t-rct"],
  ["La Rochelle", "t-sr"],
  ["Stade Rochelais", "t-sr"],
  ["Aviron Bayonnais", "t-bay"],
  ["Bayonne", "t-bay"],
  ["Lyon", "t-lou"],
  ["LOU Rugby", "t-lou"],
  ["Montpellier", "t-mhr"],
  ["Section Paloise", "t-sp"],
  ["Pau", "t-sp"],
  ["Perpignan", "t-usap"],
  ["USA Perpignan", "t-usap"],
  ["Castres", "t-co"],
  ["Vannes", "t-rcv"],
  ["RC Vannes", "t-rcv"],
];

for (const [name, expected] of providerNames) {
  test(`rapprochement : « ${name} » → ${expected}`, () => {
    const match = matchTeam([name], top14);
    assert.ok(match, `« ${name} » aurait dû être rapproché`);
    assert.equal(match.team.id, expected);
  });
}

test("rapprochement : les trois « Stade » ne se confondent pas", () => {
  assert.equal(matchTeam(["Stade Toulousain"], top14)?.team.id, "t-st");
  assert.equal(matchTeam(["Stade Rochelais"], top14)?.team.id, "t-sr");
  assert.equal(matchTeam(["Stade Francais Paris"], top14)?.team.id, "t-sfp");
});

test("rapprochement : Toulon et Toulouse restent distincts", () => {
  assert.equal(matchTeam(["Toulon"], top14)?.team.id, "t-rct");
  assert.equal(matchTeam(["Toulouse"], top14)?.team.id, "t-st");
});

test("rapprochement : un nom inconnu n'est jamais deviné", () => {
  assert.equal(matchTeam(["Leinster Rugby"], top14), null);
  assert.equal(matchTeam(["Grenoble"], top14), null);
  assert.equal(matchTeam([""], top14), null);
  assert.equal(matchTeam([], top14), null);
});

test("rapprochement : les graphies alternatives servent de secours", () => {
  // Le nom principal ne dit rien, l'abréviation oui.
  const match = matchTeam(["Equipe inconnue", "MHR", "Montpellier"], top14);
  assert.equal(match?.team.id, "t-mhr");
});

test("rapprochement : un alias d'admin prime sur tout", () => {
  const aliases = buildAliasIndex({ "Bayonne Basque": "BAY", "montpellier herault": "MHR" });
  assert.equal(matchTeam(["Bayonne Basque"], top14, aliases)?.team.id, "t-bay");
  assert.equal(matchTeam(["Bayonne Basque"], top14, aliases)?.reason, "alias");
  // La clé de l'alias est normalisée : accents et casse n'ont pas d'importance.
  assert.equal(matchTeam(["Montpellier Hérault"], top14, aliases)?.team.id, "t-mhr");
});

test("rapprochement : un alias mal saisi n'invente pas d'équipe", () => {
  const aliases = buildAliasIndex({ "Section Bayonnaise": "XXX" });
  assert.equal(matchTeam(["Section Bayonnaise"], top14, aliases), null);
  assert.deepEqual(buildAliasIndex(null), {});
  assert.deepEqual(buildAliasIndex(["pas", "un", "objet"]), {});
});

test("rapprochement : le motif retenu est journalisé", () => {
  const exact = matchTeam(["Racing 92"], top14);
  assert.equal(exact?.reason, "exact");
  assert.equal(exact?.score, 1);
});
