import type { MarginBucket, MatchOutcome, Team } from "@/lib/types";

/**
 * Mise en forme du pronostic — fonctions pures, partagées entre la carte
 * compacte et la carte agrandie de « Ma journée ».
 *
 * Règle produit explicite : le vainqueur pronostiqué et le score exact tenté
 * sont deux informations indépendantes. Un affichage qui les mélange (« Ton
 * prono : Vannes 6-10 ») est ambigu — on ne sait pas si 6-10 est un écart ou
 * un score. Les fonctions ci-dessous les séparent toujours.
 */

/** « Vannes » ou « Nul » — jamais le nom d'un club pour un match nul. */
export function outcomeSideLabel(
  outcome: MatchOutcome,
  homeShortName: string,
  awayShortName: string,
): string {
  if (outcome === "home") return homeShortName;
  if (outcome === "away") return awayShortName;
  return "Nul";
}

/** « 6 à 10 points », « 41 points ou plus », « 0 point ». */
export function marginBucketSentence(bucket: MarginBucket): string {
  if (bucket.maxPoints === null) return `${bucket.minPoints} points ou plus`;
  if (bucket.minPoints === bucket.maxPoints) {
    return bucket.minPoints === 0 ? "0 point" : `${bucket.minPoints} points`;
  }
  return `${bucket.minPoints} à ${bucket.maxPoints} points`;
}

/**
 * Le pronostic du vainqueur était-il correct ? Se lit uniquement sur le
 * résultat réel du match — jamais sur le niveau de score obtenu (règle
 * explicite : le score exact raté ne doit jamais faire passer un bon
 * vainqueur au rouge).
 */
export function outcomeWasCorrect(
  outcome: MatchOutcome,
  homeScore: number,
  awayScore: number,
): boolean {
  const actual: MatchOutcome =
    homeScore > awayScore ? "home" : homeScore < awayScore ? "away" : "draw";
  return outcome === actual;
}

/** « #E30613 » → « rgba(227, 6, 19, 0.16) ». Repli neutre sur une couleur illisible. */
export function hexToRgba(hex: string, alpha: number): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export interface PredictionBoxTint {
  /** Couleur de fond CSS — jamais de classe Tailwind : la couleur vient de la
   *  donnée (club), pas du code (règle n° 1). */
  background: string;
  /** Pastille à afficher devant le nom, si la couleur d'un club s'applique. */
  dotColor: string | null;
}

/**
 * La couleur de l'encart « Ton prono », selon l'état du match.
 *
 *   - Match terminé : vert si le vainqueur pronostiqué est le bon, rouge
 *     sinon — jamais la couleur d'un club, pour rester lisible d'un coup
 *     d'œil quel que soit le résultat.
 *   - Match pas encore joué : la couleur du club pronostiqué (en teinte
 *     douce, pour la lisibilité du texte), ou neutre pour un match nul ou
 *     un club sans couleur enregistrée.
 */
export function predictionBoxTint(
  outcome: MatchOutcome,
  homeTeam: Team,
  awayTeam: Team,
  outcomeCorrect: boolean | null,
): PredictionBoxTint {
  if (outcomeCorrect === true) return { background: "var(--winner-soft)", dotColor: null };
  if (outcomeCorrect === false) return { background: "var(--wrong-soft)", dotColor: null };

  const team = outcome === "home" ? homeTeam : outcome === "away" ? awayTeam : null;
  const tint = team?.primaryColor ? hexToRgba(team.primaryColor, 0.16) : null;
  if (!tint) return { background: "var(--surface-sunk)", dotColor: null };
  return { background: tint, dotColor: team!.primaryColor };
}
