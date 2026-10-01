/**
 * Les gages de fin de saison de "Prono des copains" — une règle maison pour
 * CE groupe de 6 amis précisément, pas un système générique pour toutes les
 * ligues. Volontairement non configurable, non lu depuis `app_settings` :
 * Hugo a été explicite, il ne veut pas que ce soit développé pour les autres
 * ligues, juste pour s'amuser entre amis dans celle-ci.
 *
 * La règle (telle que décrite) :
 *   - 1er : reçoit un cadeau de 100€ (un maillot), offert par tout le groupe.
 *   - 2e  : reçoit un cadeau de 30€, offert par le 6e (dernier).
 *   - 3e  : reçoit un cadeau de 20€, offert par le 5e.
 *   - 4e  : ne reçoit rien et ne doit rien en direct à un joueur précis, mais
 *           participe quand même, comme tout le monde, au cadeau du 1er.
 *   - 5e  : doit offrir le cadeau du 3e.
 *   - 6e  : doit offrir le cadeau du 2e.
 *
 * Seulement pertinente pour la ligue "Prono des copains" (COPAINS) et pour le
 * classement général à 6 joueurs — jamais pour une vue "journée"/"forme", où
 * la position n'a pas le même sens.
 */

/** `leagues.id` de "Prono des copains" en production — jamais une autre ligue. */
export const FUN_REWARDS_LEAGUE_ID = "cea6bea4-3f7a-4bff-85b8-0529b4c60942";

export type SeasonRewardTone = "gain" | "due" | "neutral";

export interface SeasonReward {
  emoji: string;
  label: string;
  tone: SeasonRewardTone;
}

/**
 * Le gage associé à une position, pour une ligue de 6 joueurs exactement.
 * `null` si la position ne correspond à aucune règle (ligue d'une autre
 * taille, ou position hors 1-6).
 */
export function seasonRewardFor(position: number, totalPlayers: number): SeasonReward | null {
  if (totalPlayers !== 6) return null;

  switch (position) {
    case 1:
      return { emoji: "🏆", label: "Le groupe t'offre un maillot (100€) !", tone: "gain" };
    case 2:
      return { emoji: "🎁", label: "Le 6e t'offre un cadeau (30€)", tone: "gain" };
    case 3:
      return { emoji: "🎁", label: "Le 5e t'offre un cadeau (20€)", tone: "gain" };
    case 4:
      return { emoji: "🤝", label: "Tu participes au maillot du 1er", tone: "neutral" };
    case 5:
      return { emoji: "💸", label: "Tu offres un cadeau au 3e (20€)", tone: "due" };
    case 6:
      return { emoji: "💸", label: "Tu offres un cadeau au 2e (30€)", tone: "due" };
    default:
      return null;
  }
}

export type SeasonZone = "demi" | "barrages";

/** La zone "façon Top 14" d'une position, pour une ligue de 6 joueurs exactement. */
export function seasonZoneFor(position: number, totalPlayers: number): SeasonZone | null {
  if (totalPlayers !== 6) return null;
  return position <= 2 ? "demi" : "barrages";
}

export const SEASON_ZONE_LABEL: Record<SeasonZone, string> = {
  demi: "Demi-finale directe",
  barrages: "Barrages",
};
