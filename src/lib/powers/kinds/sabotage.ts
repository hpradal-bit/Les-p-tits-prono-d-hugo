import type { PowerKind } from "../power.ts";
import type { ResolveContext, ResolveResult } from "../types.ts";

export const sabotage: PowerKind = {
  code: "sabotage",
  name: "Sabotage",
  emoji: "💣",
  needsTarget: true,
  needsFixture: true,

  validateDeclaration({ targetId, fixtureId, initiatorId }) {
    if (!targetId) return { valid: false, error: "Choisis un joueur à saboter." };
    if (!fixtureId) return { valid: false, error: "Choisis un match pour le Sabotage." };
    if (targetId === initiatorId) return { valid: false, error: "Tu ne peux pas te saboter toi-même." };
    return { valid: true };
  },

  resolve(ctx: ResolveContext): ResolveResult {
    const targetId = ctx.usage.targetId;
    const fixtureId = ctx.usage.snapshotBefore.fixtureId as string | undefined;
    if (!targetId || !fixtureId) {
      return { adjustments: [], outcome: { error: "missing_params" } };
    }

    const fixtureMap = ctx.fixtureScores.get(fixtureId);
    const targetPoints = fixtureMap?.get(targetId) ?? 0;
    const penalty = Math.min(targetPoints, (ctx.power.config.max_penalty as number) ?? 3);

    if (penalty === 0) {
      return {
        adjustments: [],
        outcome: { fixtureId, targetId, targetPoints, penalty: 0 },
      };
    }

    return {
      adjustments: [
        {
          userId: targetId,
          delta: -penalty,
          reason: `Sabotage : -${penalty} pts sur le match`,
        },
      ],
      outcome: { fixtureId, targetId, targetPoints, penalty },
    };
  },
};
