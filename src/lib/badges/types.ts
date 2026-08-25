/**
 * Badges — les types partagés par le moteur, le registre et le câblage.
 *
 * Règle non négociable n° 1 : aucune donnée métier en dur. Un badge est une
 * ligne de la table `badges`, sa condition vit dans `badges.rule` (JSON) et
 * le code ne fournit que l'*implémentation* d'un type de règle. Ajouter
 * « 15 bons pronos d'affilée » ne demande donc pas un déploiement, juste une
 * ligne en base.
 */

import type { Uuid } from "../types.ts";

/**
 * La condition telle qu'elle est stockée.
 *
 * `type` désigne l'implémentation au registre (`streak`, `count`,
 * `superlative`…), `kind` la mesure visée (`good_prediction`, `exact_score`…).
 * Les clés supplémentaires restent lisibles : une règle peut porter plus que
 * ce que son implémentation actuelle consomme.
 */
export interface BadgeRule {
  type: string;
  kind?: string;
  threshold?: number;
  scope?: string;
  [key: string]: unknown;
}

/** Une ligne de la table `badges`, telle que le moteur la lit. */
export interface BadgeDefinition {
  id: Uuid;
  code: string;
  name: string;
  emoji: string;
  description: string | null;
  rule: BadgeRule;
  isActive: boolean;
}

/**
 * Ce qu'un joueur a accompli, réduit aux mesures que les règles savent lire.
 *
 * Rien n'est recalculé pour les badges : ces nombres viennent tous de la fiche
 * joueur (`src/lib/stats/profile.ts`), donc du moteur de classement. Une seule
 * définition d'un bon pronostic, d'une journée gagnée et d'une remontée.
 */
export interface PlayerBadgeStats {
  userId: Uuid;
  /** Record de bons pronostics d'affilée sur la saison. */
  bestGoodStreak: number;
  /** Record de pronostics ratés d'affilée sur la saison. */
  bestBadStreak: number;
  /** Scores exacts trouvés sur la saison. */
  exactScores: number;
  /** Journées terminées à la première place (ex æquo compris). */
  roundsWon: number;
  /** Places gagnées au général sur la journée qu'on vient de clôturer. */
  climb: number;
  /** Le joueur a-t-il pronostiqué la journée clôturée ? */
  playedRound: boolean;
}

/** Un badge décerné, prêt à être écrit dans `user_badges`. */
export interface BadgeAward {
  userId: Uuid;
  badgeId: Uuid;
  badgeCode: string;
  /** Ce qui a déclenché l'attribution — écrit dans `user_badges.context`. */
  context: Record<string, unknown>;
}

/** Un candidat retourné par une règle, avant rapprochement avec le badge. */
export interface BadgeCandidate {
  userId: Uuid;
  context: Record<string, unknown>;
}
