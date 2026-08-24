import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkStandingsFreshness, checkStandingsRoster } from "./plausible.ts";
import type { ProviderStandingRow } from "./types.ts";

/**
 * Ces règles viennent d'un cas réel, et il n'avait rien d'évident.
 *
 * Le premier rafraîchissement du classement a écrit en base le tableau **final
 * de la saison précédente** : 26 journées jouées, points définitifs, et un
 * club relégué à la place du promu — alors que le calendrier, lui, donnait
 * bien la saison à venir. La réponse du fournisseur était un succès
 * parfaitement formé : aucune bascule, aucun code d'erreur, rien à quoi se
 * raccrocher. Seule la cohérence avec notre propre saison la démasque.
 */

function row(played: number, position = 1): ProviderStandingRow {
  return {
    team: { externalId: null, name: `équipe ${position}`, aliases: [] },
    position, played, won: 0, drawn: 0, lost: 0,
    pointsFor: 0, pointsAgainst: 0, bonusOffensive: 0, bonusDefensive: 0, points: 0,
  };
}

describe("fraîcheur du classement", () => {
  test("le tableau d'une saison terminée est écarté avant la première journée", () => {
    // Le cas vécu : 26 journées annoncées, 0 réellement disputée.
    const verdict = checkStandingsFreshness([row(26), row(26)], 0);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason ?? "", /26/);
    assert.match(verdict.reason ?? "", /rien n'a été écrit/);
  });

  test("un classement en phase avec la saison passe", () => {
    assert.equal(checkStandingsFreshness([row(12), row(12)], 12).ok, true);
  });

  test("une journée d'avance est tolérée", () => {
    // Un fournisseur peut compter un match terminé quelques minutes avant
    // notre propre synchronisation : ce décalage-là est normal.
    assert.equal(checkStandingsFreshness([row(13)], 12).ok, true);
    assert.equal(checkStandingsFreshness([row(14)], 12).ok, false);
  });

  test("un début de saison à zéro journée reste acceptable", () => {
    assert.equal(checkStandingsFreshness([row(0), row(0)], 0).ok, true);
    assert.equal(checkStandingsFreshness([row(1)], 0).ok, true);
  });

  test("un classement vide ne déclenche rien", () => {
    // Pas de données n'est pas la même chose que de mauvaises données.
    assert.equal(checkStandingsFreshness([], 0).ok, true);
  });

  test("c'est la ligne la plus avancée qui décide", () => {
    // Un tableau mêlant des équipes à 0 et à 26 journées reste suspect.
    assert.equal(checkStandingsFreshness([row(0), row(26)], 0).ok, false);
  });
});

describe("effectif du classement", () => {
  test("un tableau décrivant un autre effectif est écarté", () => {
    // Deux clubs de notre saison absents : ce n'est plus une graphie.
    const verdict = checkStandingsRoster(["a", "b", "c"], 14);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason ?? "", /11 clubs/);
  });

  test("un seul absent ne suffit pas à tout refuser", () => {
    // Le promu peut n'être qu'un nom inconnu du rapprochement, et ce manque
    // est déjà signalé ailleurs. Refuser tout le tableau pour ça serait pire.
    assert.equal(checkStandingsRoster(["a", "b", "c"], 4).ok, true);
  });

  test("un effectif complet passe", () => {
    assert.equal(checkStandingsRoster(["a", "b", "c", "d"], 4).ok, true);
  });

  test("les doublons ne comblent pas un manque", () => {
    // Trois lignes rapprochées vers la même équipe ne font pas trois équipes.
    assert.equal(checkStandingsRoster(["a", "a", "a"], 4).ok, false);
  });

  test("une saison sans équipe connue ne déclenche rien", () => {
    assert.equal(checkStandingsRoster([], 0).ok, true);
  });
});
