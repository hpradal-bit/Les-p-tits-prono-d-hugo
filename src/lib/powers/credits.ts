/**
 * Le texte de présentation d'un pouvoir vit dans `powers.config`, pas dans le
 * code : l'admin doit pouvoir réécrire une règle sans redéploiement. Ces
 * lectures sont centralisées ici pour qu'un seul endroit connaisse la forme de
 * la config.
 *
 * Le coût en crédits a disparu avec les crédits eux-mêmes : un pouvoir n'est
 * plus limité par une monnaie mais par un quota d'utilisations
 * (`src/lib/powers/quota.ts`).
 */

import type { Power } from "./types.ts";

export function powerEffect(power: Power): string | null {
  const raw = power.config.effect;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function powerRules(power: Power): string | null {
  const raw = power.config.rules;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}
