/**
 * Lecture du champ `prediction_scores.breakdown` : « pourquoi ces points ? ».
 *
 * Le détail est écrit par le serveur au moment du calcul (chantiers B et C) au
 * format `ScoreBreakdown`. Il est relu ici de façon tolérante — camelCase ou
 * snake_case, champ manquant — parce qu'un classement ne doit jamais tomber à
 * cause d'un détail d'affichage.
 */

import type { ScoreBreakdown, ScoreLevel } from "@/lib/types";

type Raw = Record<string, unknown>;

function asRecord(value: unknown): Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Raw)
    : {};
}

function bool(raw: Raw, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "boolean") return value;
  }
  return false;
}

function num(raw: Raw, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function str(raw: Raw, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value !== "") return value;
  }
  return null;
}

export function parseBreakdown(value: unknown): ScoreBreakdown {
  const raw = asRecord(value);
  return {
    outcomeCorrect: bool(raw, "outcomeCorrect", "outcome_correct"),
    marginCorrect: bool(raw, "marginCorrect", "margin_correct"),
    exactAttempted: bool(raw, "exactAttempted", "exact_attempted"),
    exactCorrect: bool(raw, "exactCorrect", "exact_correct"),
    actualMargin: num(raw, "actualMargin", "actual_margin"),
    actualBucketLabel: str(raw, "actualBucketLabel", "actual_bucket_label"),
    predictedBucketLabel: str(raw, "predictedBucketLabel", "predicted_bucket_label"),
    marginDerivedFromExact: bool(
      raw,
      "marginDerivedFromExact",
      "margin_derived_from_exact",
    ),
  };
}

/**
 * Le niveau de la cascade atteint, déduit du détail. `prediction_scores` ne
 * stocke pas le niveau : il se relit sans ambiguïté depuis le détail, ce qui
 * évite de dupliquer une information qui pourrait diverger.
 */
export function levelFromBreakdown(breakdown: ScoreBreakdown): ScoreLevel {
  if (!breakdown.outcomeCorrect) return "wrong";
  if (breakdown.exactCorrect) return "exact_score";
  if (breakdown.marginCorrect) return "winner_and_margin";
  return "winner";
}

/** Une phrase en français qui explique les points obtenus. */
export function explainScore(breakdown: ScoreBreakdown): string {
  const actual =
    breakdown.actualMargin === null
      ? null
      : breakdown.actualBucketLabel
        ? `${breakdown.actualMargin} pts (tranche ${breakdown.actualBucketLabel})`
        : `${breakdown.actualMargin} pts`;

  if (!breakdown.outcomeCorrect) {
    return breakdown.exactAttempted
      ? "Mauvais vainqueur : le score exact tenté n'y change rien."
      : "Mauvais vainqueur.";
  }

  if (breakdown.exactCorrect) {
    return "Score exact : le vainqueur, l'écart et le score au point près.";
  }

  if (breakdown.marginCorrect) {
    const tranche = breakdown.predictedBucketLabel ?? breakdown.actualBucketLabel;
    const base = tranche
      ? `Bon vainqueur et bonne tranche d'écart (${tranche}).`
      : "Bon vainqueur et bonne tranche d'écart.";
    return breakdown.marginDerivedFromExact
      ? `${base} Tranche déduite du score exact tenté : tenter ne coûte jamais de points.`
      : base;
  }

  const played = breakdown.predictedBucketLabel
    ? ` La tranche jouée était ${breakdown.predictedBucketLabel}.`
    : "";
  return actual
    ? `Bon vainqueur, mais l'écart réel est de ${actual}.${played}`
    : `Bon vainqueur, mais pas la bonne tranche d'écart.${played}`;
}
