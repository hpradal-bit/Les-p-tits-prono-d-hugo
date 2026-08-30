import type { MarginBucket, MatchOutcome } from "@/lib/types";

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
