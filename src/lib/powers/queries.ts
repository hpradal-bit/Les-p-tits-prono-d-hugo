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

export interface SpyReveal {
  hasAnswered: boolean;
  outcome: "home" | "draw" | "away" | null;
  marginBucketId: string | null;
  exactHomeScore: number | null;
  exactAwayScore: number | null;
}

/**
 * Le pronostic de la cible d'un Espion, sur le match visé — à n'appeler que
 * pour un match déjà verrouillé (l'appelant en est responsable : la base ne
 * connaît pas le pouvoir Espion, seulement `predictions_read`, qui autorise
 * déjà la lecture de n'importe quel pronostic après verrouillage).
 */
export async function loadSpyReveal(
  sb: SupabaseClient,
  targetId: string,
  fixtureId: string,
): Promise<SpyReveal> {
  const { data, error } = await sb
    .from("predictions")
    .select("outcome, margin_bucket_id, exact_home_score, exact_away_score")
    .eq("user_id", targetId)
    .eq("fixture_id", fixtureId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return { hasAnswered: false, outcome: null, marginBucketId: null, exactHomeScore: null, exactAwayScore: null };
  }
  return {
    hasAnswered: true,
    outcome: data.outcome as SpyReveal["outcome"],
    marginBucketId: (data.margin_bucket_id as string) ?? null,
    exactHomeScore: (data.exact_home_score as number) ?? null,
    exactAwayScore: (data.exact_away_score as number) ?? null,
  };
}

export interface PowerAdjustment {
  fixtureId: string;
  powerCode: string;
  powerEmoji: string;
  powerName: string;
  /** Somme des ajustements de ce pouvoir sur ce match — peut être négative (Sabotage). */
  delta: number;
}

/**
 * Les ajustements de points d'origine "pouvoir" du joueur, par match, sur
 * toute une saison — pour que Résultats explique "pourquoi j'ai eu N points"
 * en plus du score de base déjà affiché (`prediction_scores`), au lieu de
 * montrer un total silencieusement différent de celui du classement.
 *
 * `point_adjustments.source_id` n'a pas de clé étrangère déclarée (colonne
 * polymorphe, réutilisée par les ajustements admin et les questions bonus) :
 * la jointure vers `power_usages` se fait donc ici, à la main, plutôt que via
 * l'embarquement PostgREST.
 */
export async function loadPowerAdjustmentsByFixture(
  sb: SupabaseClient,
  userId: string,
  seasonId: string,
): Promise<Map<string, PowerAdjustment>> {
  const { data: adjustments, error } = await sb
    .from("point_adjustments")
    .select("delta, source, source_id")
    .eq("user_id", userId)
    .eq("season_id", seasonId)
    .like("source", "power:%");
  if (error) throw error;

  const rows = (adjustments ?? []) as Array<{ delta: number; source: string; source_id: string | null }>;
  const usageIds = [...new Set(rows.map((r) => r.source_id).filter((id): id is string => Boolean(id)))];
  if (usageIds.length === 0) return new Map();

  const { data: usages, error: uErr } = await sb
    .from("power_usages")
    .select("id, snapshot_before, powers!inner(code, emoji, name)")
    .in("id", usageIds);
  if (uErr) throw uErr;

  const usageById = new Map<
    string,
    { fixtureId: string | undefined; code: string; emoji: string; name: string }
  >();
  for (const u of (usages ?? []) as Array<Record<string, unknown>>) {
    const powers = u.powers as
      | { code: string; emoji: string; name: string }
      | { code: string; emoji: string; name: string }[]
      | null;
    const power = Array.isArray(powers) ? powers[0] : powers;
    if (!power) continue;
    const snapshot = (u.snapshot_before as Record<string, unknown>) ?? {};
    usageById.set(u.id as string, {
      fixtureId: (snapshot.fixtureId as string) ?? undefined,
      code: power.code,
      emoji: power.emoji,
      name: power.name,
    });
  }

  const result = new Map<string, PowerAdjustment>();
  for (const row of rows) {
    if (!row.source_id) continue;
    const usage = usageById.get(row.source_id);
    if (!usage || !usage.fixtureId) continue;
    const existing = result.get(usage.fixtureId);
    result.set(usage.fixtureId, {
      fixtureId: usage.fixtureId,
      powerCode: usage.code,
      powerEmoji: usage.emoji,
      powerName: usage.name,
      delta: (existing?.delta ?? 0) + row.delta,
    });
  }
  return result;
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
