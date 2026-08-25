/**
 * Le coût et le texte de présentation d'un pouvoir vivent dans `powers.config`,
 * pas dans le code : l'admin doit pouvoir rééquilibrer le jeu sans redéploiement.
 * Ces lectures sont centralisées ici pour qu'un seul endroit connaisse la forme
 * de la config.
 */

import type { Power } from "./types.ts";

/** Coût par défaut si un pouvoir n'en déclare pas — surchargeable par `app_settings`. */
export const FALLBACK_CREDIT_COST = 3;

export function creditCost(power: Power, fallback = FALLBACK_CREDIT_COST): number {
  const raw = power.config.credit_cost;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0
    ? Math.floor(raw)
    : fallback;
}

export function powerEffect(power: Power): string | null {
  const raw = power.config.effect;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function powerRules(power: Power): string | null {
  const raw = power.config.rules;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** Accord en nombre : « 1 crédit », « 5 crédits ». */
export function creditLabel(n: number): string {
  return `${n} crédit${n > 1 ? "s" : ""}`;
}
