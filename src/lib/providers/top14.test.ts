import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAliasIndex, matchTeam, type TeamCandidate } from "./normalize.ts";

/**
 * Le rapprochement, éprouvé sur le vrai effectif du Top 14.
 *
 * L'enjeu n'est pas théorique : une équipe non rapprochée le soir de la J1,
 * c'est un score que personne ne saisit, donc une journée sans points. Ces
 * cas viennent des graphies qu'ESPN et API-Sports emploient réellement.
 *
 * Les alias sont lus dans la migration 0021 plutôt que recopiés ici : un test
 * qui vérifie sa propre copie ne prouve rien sur ce qui est déployé.
 */

const ROSTER: [code: string, name: string, shortName: string, city: string][] = [
  ["ASM", "ASM Clermont Auvergne", "Clermont", "Clermont-Ferrand"],
  ["BAY", "Aviron Bayonnais", "Bayonne", "Bayonne"],
  ["CO", "Castres Olympique", "Castres", "Castres"],
  ["LOU", "LOU Rugby", "Lyon", "Lyon"],
  ["MHR", "Montpellier Hérault Rugby", "Montpellier", "Montpellier"],
  ["R92", "Racing 92", "Racing 92", "Nanterre"],
  ["RCT", "RC Toulon", "Toulon", "Toulon"],
  ["RCV", "RC Vannes", "Vannes", "Vannes"],
  ["SP", "Section Paloise", "Pau", "Pau"],
  ["SFP", "Stade Français Paris", "Stade Français", "Paris"],
  ["SR", "Stade Rochelais", "La Rochelle", "La Rochelle"],
  ["ST", "Stade Toulousain", "Toulouse", "Toulouse"],
  ["UBB", "Union Bordeaux-Bègles", "Bordeaux-Bègles", "Bordeaux"],
  ["USAP", "USA Perpignan", "Perpignan", "Perpignan"],
];

const teams: TeamCandidate[] = ROSTER.map(([code, name, shortName, city]) => ({
  id: code, code, name, shortName, city,
}));

/** Les alias tels que la migration 0021 les pose en base. */
function seededAliases(): Record<string, string> {
  const sql = readFileSync(
    new URL("../../../supabase/migrations/0021_team_aliases.sql", import.meta.url),
    "utf8",
  );
  const json = /update app_settings\s*\nset value = '(\{[\s\S]*?\})'::jsonb/.exec(sql);
  assert.ok(json, "la migration 0021 doit poser un objet JSON d'alias");
  return buildAliasIndex(JSON.parse(json[1]));
}

const aliases = seededAliases();

/** Ce que les fournisseurs sont susceptibles d'écrire, club par club. */
const SPELLINGS: [expected: string, spelling: string][] = [
  ["ASM", "Clermont"], ["ASM", "Clermont Auvergne"], ["ASM", "ASM Clermont Auvergne"],
  ["BAY", "Bayonne"], ["BAY", "Aviron Bayonnais"],
  ["CO", "Castres"], ["CO", "Castres Olympique"],
  ["LOU", "Lyon"], ["LOU", "LOU Rugby"], ["LOU", "Lyon OU"],
  ["LOU", "Lyon Olympique Universitaire"],
  ["MHR", "Montpellier"], ["MHR", "Montpellier Herault Rugby"],
  ["R92", "Racing 92"], ["R92", "Racing Metro 92"],
  ["RCT", "Toulon"], ["RCT", "RC Toulon"], ["RCT", "Rugby Club Toulonnais"],
  ["RCV", "Vannes"], ["RCV", "RC Vannes"],
  ["SP", "Pau"], ["SP", "Section Paloise"],
  ["SFP", "Stade Francais Paris"], ["SFP", "Stade Français"], ["SFP", "Paris"],
  ["SR", "La Rochelle"], ["SR", "Stade Rochelais"], ["SR", "Atlantique Stade Rochelais"],
  ["ST", "Toulouse"], ["ST", "Stade Toulousain"],
  ["UBB", "Bordeaux Begles"], ["UBB", "Union Bordeaux-Bègles"], ["UBB", "Bordeaux"],
  ["USAP", "Perpignan"], ["USAP", "USA Perpignan"],
];

describe("rapprochement du Top 14", () => {
  for (const [expected, spelling] of SPELLINGS) {
    test(`« ${spelling} » → ${expected}`, () => {
      const found = matchTeam([spelling], teams, aliases);
      assert.equal(found?.team.code ?? "aucun rapprochement", expected);
    });
  }

  test("les trois graphies que le seuil seul ne rattrapait pas", () => {
    // Sans alias, ces trois-là restaient sous le seuil de confiance et le
    // match n'était pas rapproché. C'est ce que la migration 0021 répare.
    for (const spelling of ["Lyon OU", "Lyon Olympique Universitaire", "Racing Metro 92"]) {
      assert.equal(matchTeam([spelling], teams), null, `${spelling} : sans alias`);
      assert.ok(matchTeam([spelling], teams, aliases), `${spelling} : avec alias`);
    }
  });

  test("chaque alias posé désigne un club existant", () => {
    // Une faute de frappe dans un code (« LO » au lieu de « LOU ») rendrait
    // l'alias silencieusement inopérant.
    const codes = new Set(teams.map((t) => t.code));
    for (const [alias, code] of Object.entries(aliases)) {
      assert.ok(codes.has(code), `alias « ${alias} » → code inconnu « ${code} »`);
    }
  });

  test("les 14 clubs sont couverts par au moins une graphie", () => {
    const covered = new Set(SPELLINGS.map(([code]) => code));
    for (const team of teams) {
      assert.ok(covered.has(team.code), `aucune graphie éprouvée pour ${team.code}`);
    }
  });

  test("un nom étranger à la compétition n'est jamais rapproché de force", () => {
    // Le Top 14 croise des clubs de Champions Cup dans les mêmes flux.
    for (const intrus of ["Leinster", "Saracens", "Munster", "Northampton Saints"]) {
      assert.equal(matchTeam([intrus], teams, aliases), null, intrus);
    }
  });
});
