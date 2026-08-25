import type { SupabaseClient } from "@supabase/supabase-js";
import type { Power, Token, PowerUsage } from "./types.ts";

export async function loadActivePowers(sb: SupabaseClient): Promise<Power[]> {
  const { data, error } = await sb
    .from("powers")
    .select("id, code, name, emoji, description, config, is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    emoji: r.emoji as string,
    description: (r.description as string) ?? null,
    config: (r.config as Record<string, unknown>) ?? {},
    isActive: r.is_active as boolean,
  }));
}

export async function loadAllPowers(sb: SupabaseClient): Promise<Power[]> {
  const { data, error } = await sb
    .from("powers")
    .select("id, code, name, emoji, description, config, is_active")
    .order("name");
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    emoji: r.emoji as string,
    description: (r.description as string) ?? null,
    config: (r.config as Record<string, unknown>) ?? {},
    isActive: r.is_active as boolean,
  }));
}

export async function loadUserTokens(
  sb: SupabaseClient,
  userId: string,
  seasonId: string,
): Promise<Token[]> {
  const { data, error } = await sb
    .from("tokens")
    .select("id, user_id, season_id, period, status, granted_at, used_at")
    .eq("user_id", userId)
    .eq("season_id", seasonId)
    .order("granted_at");
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    seasonId: r.season_id as string,
    period: r.period as Token["period"],
    status: r.status as Token["status"],
    grantedAt: r.granted_at as string,
    usedAt: (r.used_at as string) ?? null,
  }));
}

export async function loadRoundUsages(
  sb: SupabaseClient,
  roundId: string,
): Promise<PowerUsage[]> {
  const { data, error } = await sb
    .from("power_usages")
    .select("id, token_id, power_id, initiator_id, target_id, round_id, state, snapshot_before, result, created_at, resolved_at, powers!inner(code)")
    .eq("round_id", roundId)
    .in("state", ["declared", "accepted", "resolved"]);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapUsage);
}

export async function loadUserRoundUsage(
  sb: SupabaseClient,
  userId: string,
  roundId: string,
): Promise<PowerUsage | null> {
  const { data, error } = await sb
    .from("power_usages")
    .select("id, token_id, power_id, initiator_id, target_id, round_id, state, snapshot_before, result, created_at, resolved_at, powers!inner(code)")
    .eq("initiator_id", userId)
    .eq("round_id", roundId)
    .in("state", ["declared", "accepted"])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapUsage(data as Record<string, unknown>);
}

function mapUsage(r: Record<string, unknown>): PowerUsage {
  const powers = r.powers as { code: string } | { code: string }[] | null;
  const powerCode = Array.isArray(powers) ? powers[0]?.code : powers?.code;
  return {
    id: r.id as string,
    tokenId: r.token_id as string,
    powerId: r.power_id as string,
    powerCode: (powerCode as string) ?? "",
    initiatorId: r.initiator_id as string,
    targetId: (r.target_id as string) ?? null,
    roundId: r.round_id as string,
    state: r.state as PowerUsage["state"],
    snapshotBefore: (r.snapshot_before as Record<string, unknown>) ?? {},
    result: (r.result as Record<string, unknown>) ?? null,
    createdAt: r.created_at as string,
    resolvedAt: (r.resolved_at as string) ?? null,
  };
}

export async function loadFixtureScoresForRound(
  sb: SupabaseClient,
  roundId: string,
): Promise<Map<string, Map<string, number>>> {
  const { data: fixtures } = await sb
    .from("fixtures")
    .select("id")
    .eq("round_id", roundId);

  const fixtureIds = ((fixtures ?? []) as Array<{ id: string }>).map((f) => f.id);
  if (fixtureIds.length === 0) return new Map();

  const { data: scores } = await sb
    .from("prediction_scores")
    .select("points, predictions!inner(user_id, fixture_id)")
    .in("predictions.fixture_id", fixtureIds);

  const result = new Map<string, Map<string, number>>();
  for (const row of (scores ?? []) as Array<{
    points: number | null;
    predictions: { user_id: string; fixture_id: string } | { user_id: string; fixture_id: string }[];
  }>) {
    const pred = Array.isArray(row.predictions) ? row.predictions[0] : row.predictions;
    if (!pred) continue;
    let fixMap = result.get(pred.fixture_id);
    if (!fixMap) { fixMap = new Map(); result.set(pred.fixture_id, fixMap); }
    fixMap.set(pred.user_id, row.points ?? 0);
  }
  return result;
}

export async function loadRoundTotals(
  sb: SupabaseClient,
  roundId: string,
): Promise<Map<string, number>> {
  const fixtureScores = await loadFixtureScoresForRound(sb, roundId);
  const totals = new Map<string, number>();
  for (const fixMap of fixtureScores.values()) {
    for (const [userId, pts] of fixMap) {
      totals.set(userId, (totals.get(userId) ?? 0) + pts);
    }
  }
  return totals;
}
