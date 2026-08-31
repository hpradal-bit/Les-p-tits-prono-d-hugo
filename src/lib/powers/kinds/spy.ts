import type { PowerKind } from "../power.ts";
import type { ResolveContext, ResolveResult } from "../types.ts";

export const spy: PowerKind = {
  code: "spy",
  name: "Espion",
  emoji: "🕵️",
  needsTarget: true,
  needsFixture: true,

  validateDeclaration({ targetId, fixtureId, initiatorId, fixtureLocked }) {
    if (!targetId) return { valid: false, error: "Choisis un joueur à espionner." };
    if (!fixtureId) return { valid: false, error: "Choisis un match à espionner." };
    if (targetId === initiatorId) return { valid: false, error: "Tu ne peux pas t'espionner toi-même." };
    // Passé le verrouillage, le pronostic de tout le monde est de toute façon
    // visible sur la page du match : espionner ne coûterait un crédit pour rien.
    if (fixtureLocked) return { valid: false, error: "Ce match est déjà verrouillé." };
    return { valid: true };
  },

  resolve(ctx: ResolveContext): ResolveResult {
    return {
      adjustments: [],
      outcome: {
        targetId: ctx.usage.targetId,
        fixtureId: ctx.usage.snapshotBefore.fixtureId,
        revealed: true,
      },
    };
  },
};
