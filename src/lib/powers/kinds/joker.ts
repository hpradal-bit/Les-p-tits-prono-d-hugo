import type { PowerKind } from "../power.ts";
import type { ResolveContext, ResolveResult } from "../types.ts";

export const joker: PowerKind = {
  code: "joker",
  name: "Joker",
  emoji: "🛡️",
  needsTarget: false,
  needsFixture: true,

  validateDeclaration({ fixtureId }) {
    if (!fixtureId) return { valid: false, error: "Choisis un match pour le Joker." };
    return { valid: true };
  },

  resolve(ctx: ResolveContext): ResolveResult {
    const fixtureId = ctx.usage.snapshotBefore.fixtureId as string | undefined;
    if (!fixtureId) {
      return { adjustments: [], outcome: { error: "no_fixture" } };
    }

    const fixtureMap = ctx.fixtureScores.get(fixtureId);
    const basePoints = fixtureMap?.get(ctx.usage.initiatorId) ?? 0;
    const multiplier = (ctx.power.config.multiplier as number) ?? 2;
    const bonus = basePoints * (multiplier - 1);

    if (bonus === 0) {
      return {
        adjustments: [],
        outcome: { fixtureId, basePoints, multiplier, bonus: 0 },
      };
    }

    return {
      adjustments: [
        {
          userId: ctx.usage.initiatorId,
          delta: bonus,
          reason: `Joker x${multiplier} sur le match (+${bonus} pts)`,
        },
      ],
      outcome: { fixtureId, basePoints, multiplier, bonus },
    };
  },
};
