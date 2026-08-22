import type {
  FixtureResult,
  MarginBucket,
  MatchOutcome,
  Prediction,
  Ruleset,
  ScoreResult,
} from "@/lib/types";

/** Qui gagne, d'après un score. */
export function outcomeOf(result: FixtureResult): MatchOutcome {
  if (result.homeScore > result.awayScore) return "home";
  if (result.homeScore < result.awayScore) return "away";
  return "draw";
}

/** L'écart de points, toujours positif. */
export function marginOf(result: FixtureResult): number {
  return Math.abs(result.homeScore - result.awayScore);
}

/** La tranche dans laquelle tombe un écart. */
export function bucketFor(margin: number, buckets: MarginBucket[]): MarginBucket | null {
  return (
    buckets.find(
      (b) => margin >= b.minPoints && (b.maxPoints === null || margin <= b.maxPoints),
    ) ?? null
  );
}

/**
 * Calcul des points d'un pronostic. Fonction pure : mêmes entrées, même sortie,
 * toujours. C'est ce qui permet de rejouer une saison entière à l'identique.
 *
 * La cascade, du plus précis au moins précis — on retient le meilleur niveau :
 *
 *   1. mauvais vainqueur ................................. 0
 *   2. score exact tenté ET juste ........................ 10
 *   3. bonne tranche d'écart ............................. 3
 *   4. bon vainqueur seul ................................ 1
 *
 * Règle produit : tenter un score exact ne peut JAMAIS faire perdre de points.
 * La tranche est donc déduite du score exact, et si le joueur a aussi choisi une
 * tranche, on retient celle des deux qui l'arrange. C'est volontaire.
 */
export function computeScore(
  prediction: Prediction,
  result: FixtureResult,
  ruleset: Ruleset,
): ScoreResult {
  const buckets = ruleset.buckets;
  const actualOutcome = outcomeOf(result);
  const actualMargin = marginOf(result);
  const actualBucket = bucketFor(actualMargin, buckets);

  const exactAttempted =
    prediction.exactHomeScore !== null && prediction.exactAwayScore !== null;

  const exactCorrect =
    exactAttempted &&
    prediction.exactHomeScore === result.homeScore &&
    prediction.exactAwayScore === result.awayScore;

  // --- 1. Mauvais vainqueur : la cascade s'arrête ici ----------------------
  if (prediction.outcome !== actualOutcome) {
    return {
      points: ruleset.points.wrong,
      level: "wrong",
      breakdown: {
        outcomeCorrect: false,
        marginCorrect: false,
        exactAttempted,
        exactCorrect: false,
        actualMargin,
        actualBucketLabel: actualBucket?.label ?? null,
        predictedBucketLabel: null,
        marginDerivedFromExact: false,
      },
    };
  }

  // --- 2. Score exact -------------------------------------------------------
  if (exactCorrect) {
    return {
      points: ruleset.points.exact_score,
      level: "exact_score",
      breakdown: {
        outcomeCorrect: true,
        marginCorrect: true,
        exactAttempted: true,
        exactCorrect: true,
        actualMargin,
        actualBucketLabel: actualBucket?.label ?? null,
        predictedBucketLabel: actualBucket?.label ?? null,
        marginDerivedFromExact: true,
      },
    };
  }

  // --- 3. Tranche d'écart ---------------------------------------------------
  const derivedMargin = exactAttempted
    ? Math.abs(prediction.exactHomeScore! - prediction.exactAwayScore!)
    : null;

  let marginCorrect = false;
  let predictedBucketLabel: string | null = null;
  let marginDerivedFromExact = false;

  if (ruleset.marginMode === "distance") {
    const tolerance = ruleset.marginDistanceTolerance;
    const candidates = [prediction.marginValue, derivedMargin].filter(
      (m): m is number => m !== null,
    );
    marginCorrect = candidates.some((m) => Math.abs(m - actualMargin) <= tolerance);
    if (marginCorrect) {
      const hit = candidates.find((m) => Math.abs(m - actualMargin) <= tolerance)!;
      predictedBucketLabel = `${hit} ±${tolerance}`;
      marginDerivedFromExact = hit === derivedMargin && hit !== prediction.marginValue;
    } else if (candidates.length > 0) {
      predictedBucketLabel = `${candidates[0]} ±${tolerance}`;
    }
  } else {
    const chosen = prediction.marginBucketId
      ? (buckets.find((b) => b.id === prediction.marginBucketId) ?? null)
      : null;
    const derived = derivedMargin !== null ? bucketFor(derivedMargin, buckets) : null;

    const chosenHits = chosen !== null && actualBucket !== null && chosen.id === actualBucket.id;
    const derivedHits = derived !== null && actualBucket !== null && derived.id === actualBucket.id;

    marginCorrect = chosenHits || derivedHits;
    // Ne jamais pénaliser le score exact : on affiche la tranche qui l'arrange.
    predictedBucketLabel = marginCorrect
      ? (chosenHits ? chosen!.label : derived!.label)
      : (chosen?.label ?? derived?.label ?? null);
    marginDerivedFromExact = marginCorrect && !chosenHits && derivedHits;
  }

  if (marginCorrect) {
    return {
      points: ruleset.points.winner_and_margin,
      level: "winner_and_margin",
      breakdown: {
        outcomeCorrect: true,
        marginCorrect: true,
        exactAttempted,
        exactCorrect: false,
        actualMargin,
        actualBucketLabel: actualBucket?.label ?? null,
        predictedBucketLabel,
        marginDerivedFromExact,
      },
    };
  }

  // --- 4. Bon vainqueur seul ------------------------------------------------
  return {
    points: ruleset.points.winner,
    level: "winner",
    breakdown: {
      outcomeCorrect: true,
      marginCorrect: false,
      exactAttempted,
      exactCorrect: false,
      actualMargin,
      actualBucketLabel: actualBucket?.label ?? null,
      predictedBucketLabel,
      marginDerivedFromExact: false,
    },
  };
}
