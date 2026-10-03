/**
 * Le résumé graphique « ce qui s'est passé » d'une journée : chaque pouvoir
 * déclaré sur cette journée, sous forme de carte (auteur → cible, ou auteur
 * seul pour un pouvoir sans adversaire), au lieu du texte brut du Fil.
 *
 * Même règle de visibilité que le Fil (`src/lib/powers/visibility.ts`,
 * `src/lib/feed/queries.ts`) : un pouvoir reste caché tant que son match n'a
 * pas commencé (ou, pour un pouvoir qui vise un joueur plutôt qu'un match —
 * le Duel —, tant que le premier match de la journée n'a pas commencé) —
 * sinon ce résumé deviendrait lui-même un canal de renseignement. Fonction
 * pure : aucun accès base, entièrement testable.
 */

import { isPowerPublic } from "./visibility.ts";
import type { PowerUsage } from "./types.ts";
import type { PlayerRef } from "@/lib/standings/engine";
import type { Uuid } from "@/lib/types";

export interface DigestPowerInfo {
  emoji: string;
  name: string;
  /** Le texte d'effet déjà écrit pour l'admin (`powerEffect()`), réutilisé tel quel. */
  effect: string | null;
}

export interface DigestFixtureInfo {
  kickoffAt: string;
  label: string;
}

export interface PowerDigestItem {
  usageId: string;
  powerEmoji: string;
  powerName: string;
  initiator: PlayerRef;
  /** `null` pour un pouvoir qui ne vise aucun joueur (Oracle, Joker). */
  target: PlayerRef | null;
  fixtureLabel: string | null;
  effect: string | null;
  caption: string;
}

export function buildPowerDigest(input: {
  usages: readonly PowerUsage[];
  powersById: ReadonlyMap<Uuid, DigestPowerInfo>;
  playersById: ReadonlyMap<Uuid, PlayerRef>;
  fixturesById: ReadonlyMap<Uuid, DigestFixtureInfo>;
  /** Le coup d'envoi le plus tôt de la journée — révèle un pouvoir sans match visé. */
  roundFirstKickoffAt: string | null;
  now?: Date;
}): PowerDigestItem[] {
  const now = input.now ?? new Date();
  const items: PowerDigestItem[] = [];

  for (const usage of input.usages) {
    const power = input.powersById.get(usage.powerId);
    if (!power) continue;

    const fixtureId = (usage.snapshotBefore.fixtureId as string | undefined) ?? null;
    const fixture = fixtureId ? input.fixturesById.get(fixtureId) ?? null : null;
    const kickoff = fixture?.kickoffAt ?? input.roundFirstKickoffAt;
    if (!isPowerPublic(kickoff, now)) continue;

    const initiator = input.playersById.get(usage.initiatorId);
    if (!initiator) continue;
    const target = usage.targetId ? input.playersById.get(usage.targetId) ?? null : null;

    const caption = target
      ? `${initiator.displayName} a lancé un ${power.name} sur ${target.displayName}`
      : `${initiator.displayName} a utilisé ${power.name}`;

    items.push({
      usageId: usage.id,
      powerEmoji: power.emoji,
      powerName: power.name,
      initiator,
      target,
      fixtureLabel: fixture?.label ?? null,
      effect: power.effect,
      caption,
    });
  }

  return items;
}
