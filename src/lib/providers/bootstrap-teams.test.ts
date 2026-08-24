import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { deriveCode, deriveShortName, planTeamSeeds } from "./bootstrap-teams.ts";
import type { ProviderTeam } from "./types.ts";

/**
 * Amorcer l'effectif d'une compétition nouvelle.
 *
 * Ces codes ne prétendent pas être officiels : ils permettent à une
 * synchronisation d'aboutir sur une compétition dont on ne connaît pas encore
 * l'effectif. L'espace admin les corrige ensuite.
 */

function team(name: string, externalId: string | null = null): ProviderTeam {
  return { externalId, name, aliases: [] };
}

describe("dériver un code d'équipe", () => {
  test("un sigle présent dans le nom est conservé", () => {
    // « ASM », « USAP » : c'est ce que les joueurs reconnaissent, mieux vaut
    // le garder que de reconstruire des initiales.
    assert.equal(deriveCode("ASM Clermont"), "ASM");
    assert.equal(deriveCode("USA Perpignan"), "USA");
  });

  test("les mots passe-partout ne comptent pas", () => {
    // « Rugby », « Club », « Olympique » ne distinguent aucun club : une fois
    // écartés, il ne reste qu'un mot, dont on prend les premières lettres.
    // Une initiale seule (« V », « C ») serait illisible dans un classement.
    assert.equal(deriveCode("Rugby Club Vannetais"), "VAN");
    assert.equal(deriveCode("Castres Olympique Rugby"), "CAS");
  });

  test("plusieurs mots distinctifs donnent des initiales", () => {
    assert.equal(deriveCode("Union Bordeaux Begles"), "BB");
    assert.equal(deriveCode("Stade Rochelais"), "SR");
  });

  test("un seul mot distinctif donne ses premières lettres", () => {
    // « B » seul serait illisible dans un tableau de classement.
    assert.equal(deriveCode("Biarritz Olympique"), "BIA");
  });

  test("les accents ne cassent pas la dérivation", () => {
    assert.equal(deriveCode("Béziers Hérault Rugby"), "BH");
  });

  test("un nom vide ne fait pas planter", () => {
    assert.equal(deriveCode(""), "EQ");
    assert.equal(deriveCode("   "), "EQ");
  });
});

describe("nom court", () => {
  test("il retient les mots distinctifs", () => {
    assert.equal(deriveShortName("Rugby Club Vannetais"), "Vannetais");
    assert.equal(deriveShortName("Union Bordeaux Begles"), "Bordeaux Begles");
  });
});

describe("planifier la création d'un effectif", () => {
  test("chaque équipe reçoit un code utilisable", () => {
    const seeds = planTeamSeeds([team("Stade Rochelais", "e1"), team("ASM Clermont", "e2")]);
    assert.deepEqual(seeds.map((s) => s.code), ["SR", "ASM"]);
    assert.deepEqual(seeds.map((s) => s.externalId), ["e1", "e2"]);
  });

  test("une équipe citée deux fois n'est créée qu'une fois", () => {
    // Le fournisseur la renvoie à chaque match : aller et retour compris.
    const seeds = planTeamSeeds([team("Stade Rochelais"), team("stade rochelais")]);
    assert.equal(seeds.length, 1);
  });

  test("deux noms donnant le même code sont départagés", () => {
    // La base impose l'unicité du code par sport : sans suffixe, la création
    // échouerait et le club n'apparaîtrait dans aucun match.
    const seeds = planTeamSeeds([team("Stade Rochelais"), team("Stade Rennais")]);
    assert.equal(seeds[0].code, "SR");
    assert.notEqual(seeds[1].code, "SR");
    assert.equal(new Set(seeds.map((s) => s.code)).size, 2);
  });

  test("un code déjà pris par le sport est évité", () => {
    const seeds = planTeamSeeds([team("Stade Rochelais")], ["SR"]);
    assert.notEqual(seeds[0].code, "SR");
  });

  test("la casse ne permet pas de contourner une collision", () => {
    const seeds = planTeamSeeds([team("Stade Rochelais")], ["sr"]);
    assert.notEqual(seeds[0].code.toUpperCase(), "SR");
  });

  test("les noms vides sont ignorés", () => {
    assert.deepEqual(planTeamSeeds([team("  "), team("Brive")]).map((s) => s.name), ["Brive"]);
  });

  test("un effectif entier de Pro D2 sort sans collision", () => {
    // Le cas d'usage : seize clubs découverts d'un coup, aucun connu d'avance.
    const noms = [
      "Provence Rugby", "Colomiers Rugby", "Rugby Club Vannetais", "US Montauban",
      "Stade Aurillacois", "Béziers Hérault Rugby", "Biarritz Olympique", "SU Agen",
      "CA Brive", "FC Grenoble", "USON Nevers", "Oyonnax Rugby",
      "Stade Montois", "Soyaux Angoulême", "Valence Romans", "US Dax",
    ];
    const seeds = planTeamSeeds(noms.map((n) => team(n)));
    assert.equal(seeds.length, 16);
    assert.equal(new Set(seeds.map((s) => s.code)).size, 16, "chaque club doit avoir un code distinct");
    assert.ok(seeds.every((s) => s.code.length >= 1 && s.code.length <= 5));
  });
});
