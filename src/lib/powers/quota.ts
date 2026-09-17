/**
 * Les quotas par pouvoir — ce qui a remplacé les crédits.
 *
 * Chaque pouvoir est utilisable un nombre fixe de fois **par joueur et par
 * saison**. Une fois épuisé, il ne revient pas : c'est ce qui rend le choix du
 * moment intéressant. Rien n'est codé en dur ici, le plafond vient de
 * `powers.config.max_uses_per_player`, sinon du réglage global.
 *
 * Une déclaration annulée ne consomme rien : elle n'a jamais eu lieu. Une
 * déclaration en cours, elle, compte déjà — sinon on pourrait en déclarer
 * quatre avant que la première se résolve.
 */

import type { Power } from "./types.ts";

/** Plafond appliqué à un pouvoir qui n'en déclare pas. */
export const FALLBACK_MAX_USES = 3;

/** Les états qui consomment le quota. `cancelled` en est volontairement absent. */
export const CONSUMING_STATES = ["declared", "accepted", "resolved"] as const;

export interface PowerQuota {
  powerId: string;
  code: string;
  name: string;
  emoji: string;
  used: number;
  max: number;
  remaining: number;
  /** Faux dès que le quota est épuisé : l'écran grise, le serveur refuse. */
  available: boolean;
}

export function maxUses(power: Power, fallback = FALLBACK_MAX_USES): number {
  const raw = power.config.max_uses_per_player;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0
    ? Math.floor(raw)
    : fallback;
}

/**
 * Assemble le quota d'un joueur pour chaque pouvoir actif.
 *
 * `usedByPowerId` ne compte que les états consommateurs — c'est à l'appelant
 * de l'avoir filtré, parce que lui seul sait interroger la base.
 */
export function buildQuotas(
  powers: Power[],
  usedByPowerId: Map<string, number>,
  fallback = FALLBACK_MAX_USES,
): PowerQuota[] {
  return powers.map((power) => {
    const max = maxUses(power, fallback);
    const used = usedByPowerId.get(power.id) ?? 0;
    const remaining = Math.max(0, max - used);
    return {
      powerId: power.id,
      code: power.code,
      name: power.name,
      emoji: power.emoji,
      used,
      max,
      remaining,
      available: remaining > 0,
    };
  });
}

/** Le refus à afficher au joueur, ou `null` s'il peut y aller. */
export function quotaRefusal(quota: PowerQuota | undefined, powerName: string): string | null {
  if (!quota) return `${powerName} n'est pas disponible.`;
  if (quota.available) return null;
  return quota.max === 0
    ? `${powerName} est désactivé cette saison.`
    : `Tu as déjà utilisé tes ${quota.max} ${powerName}. Il n'en reste plus.`;
}

/** « 2 sur 3 » — la forme courte, pour les pastilles. */
export function quotaLabel(quota: PowerQuota): string {
  return `${quota.remaining}/${quota.max}`;
}
