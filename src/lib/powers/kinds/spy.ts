import type { PowerKind } from "../power.ts";
import type { ResolveContext, ResolveResult } from "../types.ts";

export const spy: PowerKind = {
  code: "spy",
  name: "Espion",
  emoji: "🕵️",
  needsTarget: true,
  needsFixture: true,

  validateDeclaration({ targetId, fixtureId, initiatorId }) {
    if (!targetId) return { valid: false, error: "Choisis un joueur à espionner." };
    if (!fixtureId) return { valid: false, error: "Choisis un match à espionner." };
    if (targetId === initiatorId) return { valid: false, error: "Tu ne peux pas t'espionner toi-même." };
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
