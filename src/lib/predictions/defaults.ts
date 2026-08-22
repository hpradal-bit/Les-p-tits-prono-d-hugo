import type { MarginBucket, MatchOutcome, Ruleset, Uuid } from "@/lib/types";

/**
 * Le prono par défaut — fonctions pures.
 *
 * Pourquoi il existe (cf. audit, point 6.2) : un joueur qui oublie une journée
 * marque 0 et décroche. Le prono par défaut le garde dans la course sans
 * récompenser l'oubli — c'est le choix le plus banal possible, jamais un bon
 * choix. Il est marqué `is_auto = true` et le fil social le dit.
 *
 * Rien n'est en dur : `ruleset.defaultPrediction` décide de tout, et le
 * mécanisme se désactive d'un réglage.
 */

export interface DefaultPredictionContext {
  /** La dernière issue jouée par ce joueur (mode « last_choice »). */
  lastChoice?: MatchOutcome | null;
  /** L'issue majoritaire des pronostics déjà posés sur ce match (mode « median »). */
  consensus?: MatchOutcome | null;
}

export interface DefaultPredictionDraft {
  outcome: MatchOutcome;
  marginBucketId: Uuid | null;
  marginValue: number | null;
}

/** La tranche du milieu — celle qui n'avantage ni ne pénalise personne. */
export function medianBucket(buckets: readonly MarginBucket[]): MarginBucket | null {
  if (buckets.length === 0) return null;
  const sorted = [...buckets].sort((a, b) => a.position - b.position);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** Valeur représentative d'une tranche, pour le mode « distance ». */
export function bucketMidpoint(bucket: MarginBucket): number {
  if (bucket.maxPoints === null) return bucket.minPoints;
  return Math.round((bucket.minPoints + bucket.maxPoints) / 2);
}

/**
 * La tranche par défaut : « median », ou l'identifiant / le libellé d'une
 * tranche précise si l'admin en a désigné une.
 */
export function resolveDefaultBucket(ruleset: Ruleset): MarginBucket | null {
  const wanted = ruleset.defaultPrediction.marginBucket;
  if (wanted !== "median") {
    const found = ruleset.buckets.find((b) => b.id === wanted || b.label === wanted);
    if (found) return found;
  }
  return medianBucket(ruleset.buckets);
}

/**
 * L'issue par défaut.
 *
 *   home        → le domicile, l'issue la plus probable au rugby
 *   last_choice → la dernière issue jouée par le joueur, à défaut le domicile
 *   median      → l'issue majoritaire du groupe sur ce match, à défaut le domicile
 */
export function resolveDefaultOutcome(
  ruleset: Ruleset,
  ctx: DefaultPredictionContext = {},
): MatchOutcome {
  switch (ruleset.defaultPrediction.outcome) {
    case "last_choice":
      return ctx.lastChoice ?? "home";
    case "median":
      return ctx.consensus ?? "home";
    case "home":
    default:
      return "home";
  }
}

/** L'issue majoritaire d'une liste de pronostics. Égalité → domicile. */
export function consensusOutcome(
  outcomes: readonly MatchOutcome[],
): MatchOutcome | null {
  if (outcomes.length === 0) return null;
  const tally: Record<MatchOutcome, number> = { home: 0, draw: 0, away: 0 };
  for (const o of outcomes) tally[o] += 1;

  // Ordre de départage volontairement stable : domicile, extérieur, nul.
  const order: MatchOutcome[] = ["home", "away", "draw"];
  return order.reduce((best, o) => (tally[o] > tally[best] ? o : best), order[0]);
}

/**
 * Le pronostic posé au verrouillage pour un joueur qui n'a rien joué.
 * Jamais de score exact : le prono par défaut ne dépense pas un quota.
 */
export function buildDefaultPrediction(
  ruleset: Ruleset,
  ctx: DefaultPredictionContext = {},
): DefaultPredictionDraft {
  const bucket = resolveDefaultBucket(ruleset);
  const distance = ruleset.marginMode === "distance";

  return {
    outcome: resolveDefaultOutcome(ruleset, ctx),
    marginBucketId: distance ? null : (bucket?.id ?? null),
    marginValue: distance && bucket ? bucketMidpoint(bucket) : null,
  };
}
