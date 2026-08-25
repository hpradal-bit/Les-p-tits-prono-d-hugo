/**
 * Le registre des types de règles de badge.
 *
 * Même principe que le registre des pouvoirs (`src/lib/powers/registry.ts`) :
 * la base dit *quels* badges existent, le code dit *comment* se lit un type de
 * règle. Un badge dont le type n'a pas d'implémentation est ignoré sans faire
 * échouer la clôture — il attendra son implémentation.
 *
 * Tout est pur : mêmes entrées, mêmes badges décernés.
 */

import type { BadgeCandidate, BadgeRule, PlayerBadgeStats } from "./types.ts";

export interface BadgeRuleKind {
  type: string;
  /** Les joueurs qui remplissent la condition, avec le contexte à archiver. */
  award(rule: BadgeRule, stats: PlayerBadgeStats[]): BadgeCandidate[];
}

/**
 * Les mesures qu'une règle à seuil peut viser.
 *
 * Le nom de la clé est celui écrit dans `badges.rule.kind`. Ajouter une mesure
 * ici suffit à rendre un nouveau badge attribuable, sans toucher au reste.
 */
const METRICS: Record<string, (s: PlayerBadgeStats) => number> = {
  good_prediction: (s) => s.bestGoodStreak,
  bad_prediction: (s) => s.bestBadStreak,
  exact_score: (s) => s.exactScores,
  round_won: (s) => s.roundsWon,
};

/**
 * Règle à seuil : le joueur décroche le badge dès que sa mesure atteint le
 * seuil. `streak` et `count` se lisent exactement pareil — seule la mesure
 * change — mais restent deux types distincts pour que la base reste explicite.
 */
function thresholdKind(type: string): BadgeRuleKind {
  return {
    type,
    award(rule, stats) {
      const metric = rule.kind ? METRICS[rule.kind] : undefined;
      const threshold = typeof rule.threshold === "number" ? rule.threshold : null;
      if (!metric || threshold === null) return [];

      return stats
        .filter((s) => metric(s) >= threshold)
        .map((s) => ({
          userId: s.userId,
          context: { kind: rule.kind, value: metric(s), threshold },
        }));
    },
  };
}

/** Les mesures d'un superlatif : « celui qui en a le plus », pas « au moins ». */
const SUPERLATIVES: Record<string, (s: PlayerBadgeStats) => number> = {
  biggest_climb: (s) => s.climb,
};

/**
 * Règle de superlatif : le meilleur de la journée l'emporte, et lui seul.
 *
 * Les ex æquo sont tous récompensés — à six joueurs, deux remontées de trois
 * places le même samedi n'ont rien d'improbable, et départager au hasard serait
 * pire que partager. Un joueur qui n'a pas joué la journée ne concourt pas.
 */
const superlative: BadgeRuleKind = {
  type: "superlative",
  award(rule, stats) {
    const metric = rule.kind ? SUPERLATIVES[rule.kind] : undefined;
    if (!metric) return [];

    const eligible = stats.filter((s) => s.playedRound && metric(s) > 0);
    if (eligible.length === 0) return [];

    const best = Math.max(...eligible.map(metric));
    return eligible
      .filter((s) => metric(s) === best)
      .map((s) => ({
        userId: s.userId,
        context: { kind: rule.kind, value: best, scope: rule.scope ?? "round" },
      }));
  },
};

const ALL: BadgeRuleKind[] = [thresholdKind("streak"), thresholdKind("count"), superlative];
const BY_TYPE = new Map(ALL.map((k) => [k.type, k]));

export function getRuleKind(type: string): BadgeRuleKind | undefined {
  return BY_TYPE.get(type);
}

export function allRuleKinds(): BadgeRuleKind[] {
  return ALL;
}

/** Les mesures connues, pour les tests et l'écran d'administration. */
export function knownMetrics(): string[] {
  return [...Object.keys(METRICS), ...Object.keys(SUPERLATIVES)];
}
