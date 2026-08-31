import type { PowerKind } from "../power.ts";
import type { ResolveContext, ResolveResult } from "../types.ts";

export const duel: PowerKind = {
  code: "duel",
  name: "Duel",
  emoji: "⚔️",
  needsTarget: true,
  needsFixture: false,

  validateDeclaration({ initiatorId, targetId, power, standings }) {
    if (!targetId) return { valid: false, error: "Choisis un adversaire." };
    if (targetId === initiatorId) return { valid: false, error: "Tu ne peux pas te défier toi-même." };

    // Deux joueurs à égalité de points partagent la même position (le moteur
    // de classement, `positionsOf`, les classe ex æquo) — "mieux classé ou à
    // égalité" se lit donc simplement position <= position, sans traiter
    // l'égalité à part.
    const rule = (power.config.target_rule as string) ?? "better_ranked_only";
    if (rule === "better_ranked_only" || rule === "better_or_equal_ranked") {
      const initPos = standings.find((s) => s.userId === initiatorId)?.position ?? Infinity;
      const targetPos = standings.find((s) => s.userId === targetId)?.position ?? Infinity;
      const allowed = rule === "better_or_equal_ranked" ? targetPos <= initPos : targetPos < initPos;
      if (!allowed) {
        const message =
          rule === "better_or_equal_ranked"
            ? "Tu ne peux défier qu'un joueur mieux classé ou à égalité de points avec toi."
            : "Tu ne peux défier qu'un joueur mieux classé que toi.";
        return { valid: false, error: message };
      }
    }

    return { valid: true };
  },

  resolve(ctx: ResolveContext): ResolveResult {
    const targetId = ctx.usage.targetId;
    if (!targetId) {
      return { adjustments: [], outcome: { error: "no_target" } };
    }

    const initPts = ctx.roundTotals.get(ctx.usage.initiatorId) ?? 0;
    const targetPts = ctx.roundTotals.get(targetId) ?? 0;
    const tieRule = (ctx.power.config.tie as string) ?? "no_transfer";

    if (initPts === targetPts) {
      return {
        adjustments: [],
        outcome: { initiatorPoints: initPts, targetPoints: targetPts, winner: null, tie: tieRule },
      };
    }

    const initiatorWins = initPts > targetPts;
    const winnerId = initiatorWins ? ctx.usage.initiatorId : targetId;
    const loserId = initiatorWins ? targetId : ctx.usage.initiatorId;
    const loserPts = initiatorWins ? targetPts : initPts;

    return {
      adjustments: [
        {
          userId: winnerId,
          delta: loserPts,
          reason: `Duel gagné : +${loserPts} pts pris à l'adversaire`,
        },
        {
          userId: loserId,
          delta: -loserPts,
          reason: `Duel perdu : -${loserPts} pts cédés à l'adversaire`,
        },
      ],
      outcome: {
        initiatorPoints: initPts,
        targetPoints: targetPts,
        winnerId,
        loserId,
        transferred: loserPts,
      },
    };
  },
};
