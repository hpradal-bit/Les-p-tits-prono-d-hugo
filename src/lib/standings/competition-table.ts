/**
 * Classement de la compétition calculé à partir de **nos propres matchs**.
 *
 * Pourquoi : `competition_standings` est alimentée par la synchronisation, et
 * aucun des quatre fournisseurs ne sait la remplir (TheSportsDB réserve son
 * point d'accès classement aux clés payantes, Highlightly et API-Sports n'ont
 * pas de référence de saison, ESPN ne renvoie aucune entrée). La table est donc
 * restée vide depuis le début de la saison, et l'écran affiche « pas encore
 * synchronisé » indéfiniment.
 *
 * Or nous possédons déjà tous les résultats. Un tableau se recalcule à partir
 * d'eux, sans dépendre de personne.
 *
 * **Limite assumée** : le bonus offensif dépend du nombre d'essais, que nous ne
 * stockons pas — aucun fournisseur ne nous le donne aujourd'hui. Il est donc
 * toujours à zéro dans ce calcul, et le total peut sous-estimer une équipe d'un
 * point par match à bonus. Le classement réel de la LNR fait foi ; celui-ci est
 * une reconstitution, et l'écran doit le dire.
 */

import type { Team } from "../types.ts";

/** Barème d'un sport, lu depuis les réglages — jamais codé en dur ici. */
export interface TablePointsRule {
  win: number;
  draw: number;
  loss: number;
  /** Écart maximal (en points) sous lequel une défaite rapporte un bonus. */
  losingBonusWithin: number;
  losingBonusPoints: number;
}

/** Le barème du rugby à XV, celui du Top 14 et de la Pro D2. */
export const RUGBY_TABLE_RULE: TablePointsRule = {
  win: 4,
  draw: 2,
  loss: 0,
  losingBonusWithin: 7,
  losingBonusPoints: 1,
};

export interface PlayedFixture {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

export interface ComputedStandingRow {
  position: number;
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Toujours 0 : le nombre d'essais n'est pas connu. Voir l'en-tête. */
  bonusOffensive: number;
  bonusDefensive: number;
  points: number;
}

interface Tally {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  bonusDefensive: number;
  points: number;
}

function emptyTally(): Tally {
  return {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    bonusDefensive: 0,
    points: 0,
  };
}

/**
 * Enregistre un match pour une équipe, du point de vue de celle-ci.
 * `scored` / `conceded` sont déjà orientés : l'appelant a fait la bascule.
 */
function record(tally: Tally, scored: number, conceded: number, rule: TablePointsRule): void {
  tally.played += 1;
  tally.pointsFor += scored;
  tally.pointsAgainst += conceded;

  if (scored > conceded) {
    tally.won += 1;
    tally.points += rule.win;
    return;
  }

  if (scored === conceded) {
    tally.drawn += 1;
    tally.points += rule.draw;
    return;
  }

  tally.lost += 1;
  tally.points += rule.loss;

  // Bonus défensif : une défaite serrée rapporte quand même.
  if (conceded - scored <= rule.losingBonusWithin) {
    tally.bonusDefensive += rule.losingBonusPoints;
    tally.points += rule.losingBonusPoints;
  }
}

/**
 * Le classement, trié comme celui de la LNR : points, puis différence de
 * points, puis points marqués. Les équipes sans aucun match joué figurent
 * quand même, à zéro — un classement amputé serait plus déroutant que complet.
 */
export function computeCompetitionTable(
  teams: Team[],
  fixtures: PlayedFixture[],
  rule: TablePointsRule = RUGBY_TABLE_RULE,
): ComputedStandingRow[] {
  const tallies = new Map<string, Tally>();
  for (const team of teams) tallies.set(team.id, emptyTally());

  for (const fixture of fixtures) {
    const home = tallies.get(fixture.homeTeamId);
    const away = tallies.get(fixture.awayTeamId);
    // Un match dont une équipe n'appartient pas à la saison est ignoré plutôt
    // que de fausser le tableau.
    if (!home || !away) continue;

    record(home, fixture.homeScore, fixture.awayScore, rule);
    record(away, fixture.awayScore, fixture.homeScore, rule);
  }

  return teams
    .map((team) => {
      const t = tallies.get(team.id) ?? emptyTally();
      return {
        position: 0,
        team,
        played: t.played,
        won: t.won,
        drawn: t.drawn,
        lost: t.lost,
        pointsFor: t.pointsFor,
        pointsAgainst: t.pointsAgainst,
        bonusOffensive: 0,
        bonusDefensive: t.bonusDefensive,
        points: t.points,
      };
    })
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst) ||
        b.pointsFor - a.pointsFor ||
        a.team.shortName.localeCompare(b.team.shortName),
    )
    .map((row, i) => ({ ...row, position: i + 1 }));
}
