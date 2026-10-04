import type { SupabaseClient } from "@supabase/supabase-js";
import type { Power, PowerUsage } from "./types.ts";
import { CONSUMING_STATES } from "./quota.ts";

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
 * Le pronostic — même encore provisoire, avant verrouillage — de la cible
 * d'un Espion, sur le match visé.
 *
 * Exception délibérée à la règle n° 3 (« un pronostic d'autrui n'est lisible
 * qu'après verrouillage ») : c'est tout l'intérêt du pouvoir Espion, qui
 * paie précisément pour voir un pronostic en avance (cahier des charges
 * §32). La règle n° 3 protège la lecture directe par un client — RLS,
 * `predictions_read` — qui, elle, reste inchangée et continue d'interdire
 * ça à n'importe qui d'autre. Cette fonction n'est donc jamais appelée
 * qu'ici, côté serveur, avec le client de service, et seulement pour le
 * (cible, match) exact enregistré dans une utilisation d'Espion achetée par
 * l'appelant — jamais une lecture libre.
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

/**
 * Le total de points d'un joueur sur une journée : pronostics notés
 * (`prediction_scores`) **plus** tout ajustement d'origine pouvoir pour
 * cette même journée (`point_adjustments`, source `power:*`) — un bonus
 * Oracle ou une pénalité Sabotage comptent dans "combien j'ai marqué
 * aujourd'hui" au même titre qu'un pronostic juste.
 *
 * Seule exception : les ajustements `power:duel` eux-mêmes sont exclus de
 * la somme. Deux raisons : (1) c'est ce total qui sert à calculer le
 * transfert d'UN Duel (`duel.ts#resolve`) — y inclure son propre ajustement
 * (pas encore écrit au moment du calcul, de toute façon) ou celui d'un AUTRE
 * Duel déjà résolu sur la même journée ferait double compte un transfert de
 * points entre joueurs dans le total qui décide d'un autre transfert ; (2)
 * la vue "en direct" (`battle.ts#computeDuelBattle`, via `battle-queries.ts`)
 * doit retomber EXACTEMENT sur ce même nombre une fois tous les matchs
 * officiels (`battle.test.ts`) — elle appelle cette fonction aussi, jamais
 * un calcul séparé.
 *
 * Utilisée aussi bien par `resolve.ts` (résolution réelle, à la clôture ou
 * match par match) que par `battle-queries.ts` (aperçu en direct) : un seul
 * endroit décide de ce qu'est "le total de la journée", jamais deux calculs
 * qui pourraient diverger.
 */
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

  const { data: adjustments, error } = await sb
    .from("point_adjustments")
    .select("user_id, delta, source")
    .eq("round_id", roundId)
    .like("source", "power:%");
  if (error) throw error;

  for (const row of (adjustments ?? []) as Array<{
    user_id: string;
    delta: number;
    source: string;
  }>) {
    // Cf. commentaire ci-dessus : jamais le transfert d'un Duel (le sien,
    // pas encore écrit — ou celui d'un autre Duel déjà résolu) dans le total
    // qui sert justement à calculer un transfert de Duel.
    if (row.source === "power:duel") continue;
    totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + row.delta);
  }

  return totals;
}

/**
 * Combien de fois chaque pouvoir a déjà été utilisé par un joueur sur une
 * saison. Ne compte que les états consommateurs : une déclaration annulée n'a
 * jamais eu lieu et ne doit rien coûter.
 */
export async function loadUsageCounts(
  sb: SupabaseClient,
  userId: string,
  seasonId: string,
  /** Ligne de départ : les utilisations antérieures ne comptent plus. */
  since: string | null = null,
): Promise<Map<string, number>> {
  let query = sb
    .from("power_usages")
    .select("power_id, rounds!inner(season_id)")
    .eq("initiator_id", userId)
    .eq("rounds.season_id", seasonId)
    .in("state", [...CONSUMING_STATES]);
  if (since) query = query.gte("created_at", since);
  const { data, error } = await query;
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ power_id: string }>) {
    counts.set(row.power_id, (counts.get(row.power_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Le même décompte, mais pour tous les joueurs d'un coup — la matière des
 * compteurs affichés au bas du classement. Une seule requête : à six joueurs
 * et cinq pouvoirs, filtrer par joueur n'apporterait rien.
 */
export async function loadSeasonUsageByPlayer(
  sb: SupabaseClient,
  seasonId: string,
  /** Ligne de départ : les utilisations antérieures ne comptent plus. */
  since: string | null = null,
): Promise<Map<string, Map<string, number>>> {
  let query = sb
    .from("power_usages")
    .select("power_id, initiator_id, rounds!inner(season_id)")
    .eq("rounds.season_id", seasonId)
    .in("state", [...CONSUMING_STATES]);
  if (since) query = query.gte("created_at", since);
  const { data, error } = await query;
  if (error) throw error;

  const byPlayer = new Map<string, Map<string, number>>();
  for (const row of (data ?? []) as Array<{ power_id: string; initiator_id: string }>) {
    let counts = byPlayer.get(row.initiator_id);
    if (!counts) {
      counts = new Map<string, number>();
      byPlayer.set(row.initiator_id, counts);
    }
    counts.set(row.power_id, (counts.get(row.power_id) ?? 0) + 1);
  }
  return byPlayer;
}
