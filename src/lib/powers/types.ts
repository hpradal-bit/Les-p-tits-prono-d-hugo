export type TokenStatus = "available" | "used" | "expired";
export type TokenPeriod = "first_half" | "second_half" | "full_season";
export type UsageState = "declared" | "accepted" | "resolved" | "cancelled";

export interface Power {
  id: string;
  code: string;
  name: string;
  emoji: string;
  description: string | null;
  config: Record<string, unknown>;
  isActive: boolean;
}

export interface Token {
  id: string;
  userId: string;
  seasonId: string;
  period: TokenPeriod;
  status: TokenStatus;
  grantedAt: string;
  usedAt: string | null;
}

export interface PowerUsage {
  id: string;
  tokenId: string;
  powerId: string;
  powerCode: string;
  initiatorId: string;
  targetId: string | null;
  roundId: string;
  state: UsageState;
  snapshotBefore: Record<string, unknown>;
  result: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface TokenRow {
  id: string;
  usage: PowerUsage | null;
}

export interface ResolveContext {
  usage: PowerUsage;
  power: Power;
  fixtureScores: Map<string, Map<string, number>>;
  roundTotals: Map<string, number>;
}

export interface Adjustment {
  userId: string;
  delta: number;
  reason: string;
}

export interface ResolveResult {
  adjustments: Adjustment[];
  outcome: Record<string, unknown>;
}
