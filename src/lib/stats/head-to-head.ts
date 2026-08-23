/**
 * Face-à-face — chantier H.
 *
 * Quand on consulte le profil d'un autre joueur, la comparaison est directe et
 * automatique : on ne demande rien, on montre. Les deux fiches sont déjà
 * calculées par `buildProfiles` ; il ne reste qu'à les mettre côte à côte et à
 * compter les journées gagnées l'un contre l'autre.
 *
 * Fonction pure.
 */

import type { PlayerProfile } from "./profile";

/** Une ligne de comparaison, telle qu'elle s'affiche. */
export interface ComparisonLine {
  label: string;
  /** Valeur brute du joueur consulté, pour décider du vainqueur. */
  aValue: number;
  bValue: number;
  /** Valeur formatée pour l'affichage. */
  aText: string;
  bText: string;
  /** Qui mène sur cette ligne. */
  leader: "a" | "b" | "tie";
}

export interface HeadToHead {
  a: PlayerProfile;
  b: PlayerProfile;
  /** Journées où l'un a marqué plus que l'autre. */
  duels: { aWins: number; bWins: number; draws: number };
  /** Nombre de journées réellement comparables. */
  roundsCompared: number;
  lines: ComparisonLine[];
}

function leaderOf(a: number, b: number): ComparisonLine["leader"] {
  if (a > b) return "a";
  if (b > a) return "b";
  return "tie";
}

function line(
  label: string,
  aValue: number,
  bValue: number,
  format: (v: number) => string = (v) => String(v),
): ComparisonLine {
  return {
    label,
    aValue,
    bValue,
    aText: format(aValue),
    bText: format(bValue),
    leader: leaderOf(aValue, bValue),
  };
}

function percent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)} %`;
}

/**
 * Compare deux joueurs. Une journée n'entre dans le duel que si au moins l'un
 * des deux y a pronostiqué : sinon un 0-0 gratuit gonflerait les égalités.
 */
export function computeHeadToHead(a: PlayerProfile, b: PlayerProfile): HeadToHead {
  let aWins = 0;
  let bWins = 0;
  let draws = 0;
  let roundsCompared = 0;

  const bByRound = new Map(b.history.map((line) => [line.round.id, line]));
  for (const lineA of a.history) {
    const lineB = bByRound.get(lineA.round.id);
    if (!lineB) continue;
    if (lineA.played === 0 && lineB.played === 0) continue;
    roundsCompared += 1;
    if (lineA.points > lineB.points) aWins += 1;
    else if (lineA.points < lineB.points) bWins += 1;
    else draws += 1;
  }

  const lines: ComparisonLine[] = [
    // Le rang se lit à l'envers : plus il est petit, mieux c'est.
    {
      label: "Classement général",
      aValue: -a.rank,
      bValue: -b.rank,
      aText: `${a.rank}e`,
      bText: `${b.rank}e`,
      leader: leaderOf(-a.rank, -b.rank),
    },
    line("Points", a.points, b.points, (v) => `${v} pt${Math.abs(v) > 1 ? "s" : ""}`),
    line("Journées gagnées", aWins, bWins),
    {
      label: "Taux de réussite",
      aValue: a.successRate ?? -1,
      bValue: b.successRate ?? -1,
      aText: percent(a.successRate),
      bText: percent(b.successRate),
      leader: leaderOf(a.successRate ?? -1, b.successRate ?? -1),
    },
    line("Scores exacts", a.exactScores, b.exactScores),
    line("Podiums de journée", a.podiums, b.podiums),
    line("Journées en tête", a.roundsWon, b.roundsWon),
    line("Meilleure série", a.streaks.good.best, b.streaks.good.best),
  ];

  return { a, b, duels: { aWins, bWins, draws }, roundsCompared, lines };
}
