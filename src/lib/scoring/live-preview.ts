/**
 * Aperçu de points EN DIRECT — jamais persisté, jamais mêlé au vrai calcul.
 *
 * `prediction_scores` n'est écrit que pour un match `official` (voir
 * `recomputeFixtures` dans `persist.ts`) : c'est une propriété volontaire de
 * ce codebase, « un match ne doit jamais contaminer l'ensemble de
 * l'application ». Ce module ne la contourne pas — il réutilise la même
 * fonction pure `computeScore`, avec le score EN DIRECT à la place du score
 * officiel, pour répondre à une question différente : « si le match
 * s'arrêtait maintenant, combien ce pronostic vaudrait-il ? ».
 *
 * Recalculé à chaque lecture, jamais stocké. Rien ici n'écrit en base.
 */

import { computeScore } from "./index.ts";
import type { FixtureResult, Prediction, Ruleset, ScoreResult, Uuid } from "@/lib/types";

/** Un aperçu de points en direct — visuellement distinct d'un `ScoreResult` officiel. */
export interface LivePreviewResult extends ScoreResult {
  /** Toujours vrai : marque qu'il ne s'agit PAS d'une note officielle. */
  isLivePreview: true;
}

/**
 * Ce qu'un pronostic vaudrait SI le score en direct devenait le score final.
 * Fonction pure : mêmes entrées, même sortie. Ne lit ni n'écrit rien.
 */
export function computeLivePreview(
  prediction: Prediction,
  liveResult: FixtureResult,
  ruleset: Ruleset,
): LivePreviewResult {
  return { ...computeScore(prediction, liveResult, ruleset), isLivePreview: true };
}

/** Le même calcul, pour tout un groupe de pronostics sur un même match. */
export function computeLivePreviewByUser(
  predictions: Prediction[],
  liveResult: FixtureResult,
  ruleset: Ruleset,
): Map<Uuid, LivePreviewResult> {
  const out = new Map<Uuid, LivePreviewResult>();
  for (const prediction of predictions) {
    out.set(prediction.userId, computeLivePreview(prediction, liveResult, ruleset));
  }
  return out;
}
