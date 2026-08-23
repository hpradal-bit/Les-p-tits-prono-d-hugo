import { test } from "node:test";
import assert from "node:assert/strict";
import { pickVersionAt, type RulesetPeriod } from "./index.ts";

/**
 * Le cœur du choix « toute la saison » ou « à partir de maintenant ».
 *
 * Ce que ces tests protègent : un match noté sous un barème doit rester noté
 * sous ce barème, même si on rejoue la saison des mois plus tard. Sans quoi
 * changer les règles en février ferait bouger les points d'octobre.
 */

interface V extends RulesetPeriod {
  name: string;
}

const at = (iso: string) => new Date(iso);

// v1 du 1er septembre au 1er novembre, v2 depuis le 1er novembre.
const versions: V[] = [
  {
    name: "v2",
    version: 2,
    effectiveFrom: "2026-11-01T00:00:00.000Z",
    effectiveTo: null,
  },
  {
    name: "v1",
    version: 1,
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    effectiveTo: "2026-11-01T00:00:00.000Z",
  },
];

test("un match d'octobre garde le barème d'octobre", () => {
  assert.equal(pickVersionAt(versions, at("2026-10-12T18:00:00.000Z"))?.name, "v1");
});

test("un match de décembre prend le nouveau barème", () => {
  assert.equal(pickVersionAt(versions, at("2026-12-05T18:00:00.000Z"))?.name, "v2");
});

test("la bascule est inclusive à l'ouverture, exclusive à la fermeture", () => {
  const pivot = at("2026-11-01T00:00:00.000Z");
  // Exactement à la bascule, c'est la nouvelle version qui prend la main.
  assert.equal(pickVersionAt(versions, pivot)?.name, "v2");
  assert.equal(pickVersionAt(versions, at("2026-10-31T23:59:59.999Z"))?.name, "v1");
});

test("une version encore ouverte couvre tout l'avenir", () => {
  assert.equal(pickVersionAt(versions, at("2027-06-30T12:00:00.000Z"))?.name, "v2");
});

test("un match antérieur au premier barème retombe sur le plus ancien", () => {
  // Le calendrier peut précéder la création du barème : mieux vaut noter avec
  // le barème initial que refuser de noter.
  assert.equal(pickVersionAt(versions, at("2026-08-01T12:00:00.000Z"))?.name, "v1");
});

test("sans aucune version, rien à choisir", () => {
  assert.equal(pickVersionAt([], at("2026-10-12T18:00:00.000Z")), null);
});

test("une seule version couvre toute la saison", () => {
  const only: V[] = [
    { name: "v1", version: 1, effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: null },
  ];
  assert.equal(pickVersionAt(only, at("2026-09-05T15:00:00.000Z"))?.name, "v1");
  assert.equal(pickVersionAt(only, at("2027-05-01T15:00:00.000Z"))?.name, "v1");
  assert.equal(pickVersionAt(only, at("2026-01-01T15:00:00.000Z"))?.name, "v1");
});

test("entre deux versions qui se chevauchent, la plus récente gagne", () => {
  // Ne devrait pas arriver, mais une clôture ratée ne doit pas rendre le
  // classement imprévisible : on tranche toujours pour la version la plus haute.
  const overlapping: V[] = [
    { name: "v1", version: 1, effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: null },
    { name: "v2", version: 2, effectiveFrom: "2026-11-01T00:00:00.000Z", effectiveTo: null },
  ];
  assert.equal(pickVersionAt(overlapping, at("2026-12-01T00:00:00.000Z"))?.name, "v2");
  assert.equal(pickVersionAt(overlapping, at("2026-10-01T00:00:00.000Z"))?.name, "v1");
});

test("rejouer la même date donne toujours la même version", () => {
  // La règle n° 2 : un rejeu doit être reproductible à l'identique.
  const date = at("2026-10-12T18:00:00.000Z");
  const first = pickVersionAt(versions, date)?.name;
  for (let i = 0; i < 5; i += 1) {
    assert.equal(pickVersionAt(versions, date)?.name, first);
  }
});
