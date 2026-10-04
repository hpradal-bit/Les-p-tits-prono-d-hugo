/**
 * Le résumé graphique « ce qui s'est passé » d'une journée : chaque pouvoir
 * déclaré sur cette journée, sous forme de carte (auteur → cible, ou auteur
 * seul pour un pouvoir sans adversaire), au lieu du texte brut du Fil.
 *
 * Même règle de visibilité que le Fil (`src/lib/powers/visibility.ts`,
 * `src/lib/feed/queries.ts`) : un pouvoir reste caché tant que la JOURNÉE
 * ENTIÈRE (tous ses matchs, `round_id`) n'a pas verrouillé — jamais
 * seulement son propre match, ni seulement le premier de la journée, sinon
 * une riposte reste possible sur un autre match du même week-end encore
 * ouvert. Fonction pure : aucun accès base, l'appelant calcule
 * `roundRevealAt` (cf. `src/lib/powers/round-lock.ts`) et le passe ici —
 * entièrement testable.
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

/**
 * Le score en direct d'un Duel encore actif — attaché après coup par
 * `journee/page.tsx` (`loadDuelBattle`, qui a besoin de la base, donc hors de
 * cette fonction pure). `null` pour tout pouvoir autre qu'un Duel, ou pour un
 * Duel déjà résolu : son issue est alors racontée par le Fil, pas par un
 * score "en direct" qui n'existe plus.
 */
export interface DigestDuelScore {
  initiatorPoints: number;
  targetPoints: number;
  remainingFixtures: number;
  tie: boolean;
  /** `null` à égalité. */
  leaderId: Uuid | null;
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
  liveDuel: DigestDuelScore | null;
}

export function buildPowerDigest(input: {
  usages: readonly PowerUsage[];
  powersById: ReadonlyMap<Uuid, DigestPowerInfo>;
  playersById: ReadonlyMap<Uuid, PlayerRef>;
  fixturesById: ReadonlyMap<Uuid, DigestFixtureInfo>;
  /**
   * Le dernier verrouillage de la journée (`max(fixtures.locks_at)`,
   * cf. `round-lock.ts`) — révèle TOUS les pouvoirs de cette journée, qu'ils
   * visent un match précis ou aucun (le Duel). `null` si la journée n'a
   * aucun match connu (rien à cacher dans ce cas).
   */
  roundRevealAt: string | null;
  now?: Date;
}): PowerDigestItem[] {
  const now = input.now ?? new Date();
  const items: PowerDigestItem[] = [];

  for (const usage of input.usages) {
    const power = input.powersById.get(usage.powerId);
    if (!power) continue;

    const fixtureId = (usage.snapshotBefore.fixtureId as string | undefined) ?? null;
    const fixture = fixtureId ? input.fixturesById.get(fixtureId) ?? null : null;
    // Révélé par la journée entière, pas par le seul match visé : cf. l'en-tête
    // de ce fichier et `round-lock.ts`.
    if (!isPowerPublic(input.roundRevealAt, now)) continue;

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
      liveDuel: null,
    });
  }

  return items;
}
