import type { PowerKind } from "../power.ts";
import type { ResolveContext, ResolveResult } from "../types.ts";

export const mirror: PowerKind = {
  code: "oracle",
  name: "Oracle",
  emoji: "🔮",
  needsTarget: false,
  needsFixture: true,

  validateDeclaration({ fixtureId }) {
    if (!fixtureId) return { valid: false, error: "Choisis un match pour l'Oracle." };
    return { valid: true };
  },

  resolve(ctx: ResolveContext): ResolveResult {
    const fixtureId = ctx.usage.snapshotBefore.fixtureId as string | undefined;
    if (!fixtureId) {
      return { adjustments: [], outcome: { error: "no_fixture" } };
    }

    const fixtureMap = ctx.fixtureScores.get(fixtureId);
    const basePoints = fixtureMap?.get(ctx.usage.initiatorId) ?? 0;
    const bonus = (ctx.power.config.bonus as number) ?? 2;

    if (basePoints === 0) {
      return {
        adjustments: [],
        outcome: { fixtureId, basePoints, bonus: 0 },
      };
    }

    return {
      adjustments: [
        {
          userId: ctx.usage.initiatorId,
          delta: bonus,
          reason: `Oracle : +${bonus} pts bonus sur le match`,
        },
      ],
      outcome: { fixtureId, basePoints, bonus },
    };
  },
};
