/**
 * Notification à la CIBLE d'un pouvoir déclaré contre elle.
 *
 * Avant ce correctif, `declarePower` (src/lib/powers/actions.ts) n'envoyait
 * strictement rien à la cible : ni Duel, ni Espion, ni Sabotage ne la
 * prévenaient — un vrai trou, pas un bug de livraison (le Fil, lui, raconte
 * déjà l'événement, mais seulement une fois public — cf. `visibility.ts` — et
 * un post dans le fil n'est pas une notification poussée sur le téléphone).
 *
 * Générique par construction : le titre et le corps se composent avec
 * l'emoji/le nom du pouvoir tels qu'ils vivent en base (`powers.emoji`,
 * `powers.name`) et son texte d'effet déjà écrit pour l'admin
 * (`powers.config.effect`, lu par `powerEffect()`) — jamais un texte par
 * pouvoir codé en dur ici, pour qu'un futur pouvoir ciblé n'ait besoin
 * d'aucune nouvelle ligne dans ce fichier.
 *
 * Seuls les pouvoirs qui visent réellement un joueur (`needsTarget`, cf.
 * `PowerKind`) en ont besoin : Duel, Espion, Sabotage — jamais Oracle/Joker,
 * qui ne visent personne.
 */

import { dedupeKey } from "./schedule.ts";
import type { NotificationRequest } from "./notify.ts";

export const POWER_DECLARED_KIND = "power_declared";

export interface PowerDeclaredInfo {
  /** `power_usages.id` — une notification par utilisation, jamais deux. */
  usageId: string;
  powerEmoji: string;
  powerName: string;
  /** Le texte d'effet déjà affiché à l'auteur (`powerEffect()`), réutilisé tel quel. */
  powerEffect: string | null;
  initiatorName: string;
}

/**
 * Construit la requête de notification pour la cible — fonction pure,
 * testable sans base ni réseau. `enqueue()` (notify.ts) s'occupe ensuite des
 * préférences, des heures de silence et du plafond quotidien.
 */
export function buildPowerDeclaredNotification(
  targetUserId: string,
  info: PowerDeclaredInfo,
): NotificationRequest {
  return {
    userId: targetUserId,
    kind: POWER_DECLARED_KIND,
    title: `${info.powerEmoji} ${info.initiatorName} a lancé un ${info.powerName} contre toi !`,
    body:
      info.powerEffect ??
      `${info.initiatorName} a activé son pouvoir ${info.powerName} contre toi sur cette journée.`,
    url: "/journee",
    dedupeKey: dedupeKey(POWER_DECLARED_KIND, info.usageId),
  };
}
