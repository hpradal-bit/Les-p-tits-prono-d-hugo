import type { Power, ResolveContext, ResolveResult } from "./types.ts";

export interface PowerKind {
  code: string;
  name: string;
  emoji: string;
  needsTarget: boolean;
  needsFixture: boolean;
  validateDeclaration(input: {
    initiatorId: string;
    targetId: string | null;
    fixtureId: string | null;
    power: Power;
    standings: { userId: string; position: number }[];
  }): { valid: boolean; error?: string };
  resolve(ctx: ResolveContext): ResolveResult;
}
