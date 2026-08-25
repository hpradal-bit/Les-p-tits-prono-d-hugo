/**
 * Le moteur d'attribution des badges — pur, déterministe, rejouable.
 *
 * Aucun accès à la base : on lui donne les badges actifs, les mesures des
 * joueurs et ce qui a déjà été décerné, il dit ce qu'il reste à décerner.
 * Rejouer une saison entière doit redonner exactement les mêmes badges.
 *
 * Un badge déjà obtenu ne l'est jamais deux fois : la contrainte
 * `unique (user_id, badge_id, season_id)` le garantit en base, le filtre
 * ci-dessous évite d'envoyer l'écriture — et surtout l'événement en double
 * dans le Vestiaire.
 */

import { getRuleKind } from "./rules.ts";
import type { BadgeAward, BadgeDefinition, PlayerBadgeStats } from "./types.ts";
import type { Uuid } from "../types.ts";

/**
 * Le minimum d'une fiche joueur dont les badges ont besoin.
 *
 * Décrit structurellement plutôt qu'importé : `PlayerProfile` le satisfait, et
 * le moteur reste testable sans traîner tout le module de statistiques.
 */
export interface ProfileLike {
  player: { userId: Uuid };
  exactScores: number;
  roundsWon: number;
  streaks: { good: { best: number }; bad: { best: number } };
  history: Array<{ round: { id: Uuid }; played: number; movement: number | null }>;
}

/** La clé d'un badge déjà obtenu, dans une saison donnée. */
export function earnedKey(userId: Uuid, badgeId: Uuid): string {
  return `${userId}:${badgeId}`;
}

/**
 * Les mesures de chaque joueur, tirées de sa fiche.
 *
 * `roundId` est la journée qu'on vient de clôturer : c'est elle qui donne la
 * remontée du jour et dit qui a joué. Une journée absente de l'historique (le
 * joueur n'a rien pronostiqué) vaut zéro remontée, pas une remontée nulle.
 */
export function statsFromProfiles(
  profiles: Iterable<ProfileLike>,
  roundId: Uuid,
): PlayerBadgeStats[] {
  const out: PlayerBadgeStats[] = [];

  for (const profile of profiles) {
    const line = profile.history.find((l) => l.round.id === roundId) ?? null;
    out.push({
      userId: profile.player.userId,
      bestGoodStreak: profile.streaks.good.best,
      bestBadStreak: profile.streaks.bad.best,
      exactScores: profile.exactScores,
      roundsWon: profile.roundsWon,
      climb: line?.movement ?? 0,
      playedRound: (line?.played ?? 0) > 0,
    });
  }

  return out;
}

export interface EvaluateInput {
  badges: BadgeDefinition[];
  stats: PlayerBadgeStats[];
  /** Clés `userId:badgeId` déjà présentes dans `user_badges` pour la saison. */
  alreadyEarned: Iterable<string>;
}

export interface EvaluateResult {
  awards: BadgeAward[];
  /** Codes des badges dont le type de règle n'a pas d'implémentation. */
  skipped: string[];
}

/** Ce qu'il reste à décerner, à cet instant de la saison. */
export function evaluateBadges(input: EvaluateInput): EvaluateResult {
  const earned = new Set(input.alreadyEarned);
  const awards: BadgeAward[] = [];
  const skipped: string[] = [];

  for (const badge of input.badges) {
    if (!badge.isActive) continue;

    // Un badge en base sans implémentation ne doit pas faire échouer la
    // clôture entière : on le note et on continue.
    const kind = getRuleKind(badge.rule?.type ?? "");
    if (!kind) {
      skipped.push(badge.code);
      continue;
    }

    for (const candidate of kind.award(badge.rule, input.stats)) {
      const key = earnedKey(candidate.userId, badge.id);
      if (earned.has(key)) continue;
      earned.add(key);
      awards.push({
        userId: candidate.userId,
        badgeId: badge.id,
        badgeCode: badge.code,
        context: candidate.context,
      });
    }
  }

  return { awards, skipped };
}
