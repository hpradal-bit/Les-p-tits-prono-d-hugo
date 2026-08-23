import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRuleset } from "@/lib/settings";
import type { Ruleset, Uuid } from "@/lib/types";

/** Lecture des données de l'espace admin. Client de service : on voit tout. */

export interface AdminFixture {
  id: Uuid;
  kickoffAt: string;
  kickoffConfirmed: boolean;
  locksAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeName: string;
  awayName: string;
  homeCode: string;
  awayCode: string;
  predictionCount: number;
  scoredCount: number;
}

export interface AdminRound {
  id: Uuid;
  number: number;
  name: string;
  status: string;
  seasonId: Uuid;
}

export async function loadRounds(): Promise<AdminRound[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("rounds")
    .select("id, number, name, status, season_id")
    .order("number");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    number: r.number as number,
    name: r.name as string,
    status: r.status as string,
    seasonId: r.season_id as string,
  }));
}

/** Les matchs d'une journée, avec le nombre de pronostics déjà scorés. */
export async function loadRoundFixtures(roundId: Uuid): Promise<AdminFixture[]> {
  const admin = createAdminClient();

  const { data: rows, error } = await admin
    .from("fixtures")
    .select(`id, kickoff_at, kickoff_confirmed, locks_at, status, home_score, away_score,
             home:home_team_id (short_name, code),
             away:away_team_id (short_name, code)`)
    .eq("round_id", roundId)
    .order("kickoff_at");
  if (error) throw error;

  const ids = (rows ?? []).map((f) => f.id as string);
  const counts = new Map<string, { total: number; scored: number }>();

  if (ids.length > 0) {
    const { data: preds } = await admin
      .from("predictions").select("id, fixture_id").in("fixture_id", ids);
    const byPrediction = new Map<string, string>();
    for (const p of preds ?? []) {
      const fid = p.fixture_id as string;
      byPrediction.set(p.id as string, fid);
      const c = counts.get(fid) ?? { total: 0, scored: 0 };
      c.total += 1;
      counts.set(fid, c);
    }
    if (byPrediction.size > 0) {
      const { data: scores } = await admin
        .from("prediction_scores").select("prediction_id")
        .in("prediction_id", [...byPrediction.keys()]);
      for (const s of scores ?? []) {
        const fid = byPrediction.get(s.prediction_id as string);
        if (!fid) continue;
        const c = counts.get(fid)!;
        c.scored += 1;
      }
    }
  }

  type TeamRef = { short_name: string; code: string };
  const one = (v: unknown): TeamRef =>
    (Array.isArray(v) ? v[0] : v) as TeamRef;

  return (rows ?? []).map((f) => {
    const c = counts.get(f.id as string) ?? { total: 0, scored: 0 };
    const home = one(f.home);
    const away = one(f.away);
    return {
      id: f.id as string,
      kickoffAt: f.kickoff_at as string,
      kickoffConfirmed: Boolean(f.kickoff_confirmed),
      locksAt: f.locks_at as string,
      status: f.status as string,
      homeScore: (f.home_score as number | null) ?? null,
      awayScore: (f.away_score as number | null) ?? null,
      homeName: home?.short_name ?? "?",
      awayName: away?.short_name ?? "?",
      homeCode: home?.code ?? "?",
      awayCode: away?.code ?? "?",
      predictionCount: c.total,
      scoredCount: c.scored,
    };
  });
}

export interface JournalEntry {
  id: Uuid;
  action: string;
  entityType: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
  adminName: string;
}

/** Le journal d'administration, du plus récent au plus ancien. */
export async function loadJournal(limit = 100): Promise<JournalEntry[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_actions")
    .select("id, action, entity_type, reason, before, after, created_at, admin:admin_id (display_name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((r) => {
    const a = (Array.isArray(r.admin) ? r.admin[0] : r.admin) as { display_name?: string } | null;
    return {
      id: r.id as string,
      action: r.action as string,
      entityType: (r.entity_type as string | null) ?? null,
      reason: (r.reason as string | null) ?? null,
      before: r.before,
      after: r.after,
      createdAt: r.created_at as string,
      adminName: a?.display_name ?? "Administration",
    };
  });
}

/** La saison en cours. L'admin ne travaille jamais sur une autre. */
export async function currentSeasonId(admin: SupabaseClient): Promise<Uuid> {
  const { data, error } = await admin
    .from("seasons")
    .select("id")
    .eq("status", "active")
    .order("starts_on", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return data.id as Uuid;
}

/** Le barème en vigueur, tel que l'admin va l'éditer. */
export async function loadCurrentRuleset(): Promise<Ruleset> {
  const admin = createAdminClient();
  return loadRuleset(admin, await currentSeasonId(admin));
}

export interface AdminPlayer {
  id: Uuid;
  firstName: string;
  displayName: string;
  avatarKind: string;
  avatarValue: string;
  isActive: boolean;
  role: string;
  seasonPoints: number;
  adjustmentTotal: number;
}

export interface AdminAdjustment {
  id: Uuid;
  userId: Uuid;
  playerName: string;
  delta: number;
  reason: string;
  source: string;
  roundName: string | null;
  createdAt: string;
  authorName: string;
}

/**
 * Les joueurs du groupe, avec leur total de la saison.
 *
 * Le total est relu depuis `prediction_scores` et `point_adjustments` à chaque
 * affichage plutôt que stocké : l'admin doit voir la même chose que le
 * classement, y compris juste après un recalcul.
 */
export async function loadPlayers(): Promise<AdminPlayer[]> {
  const admin = createAdminClient();
  const seasonId = await currentSeasonId(admin);

  const [profilesRes, membersRes, roundsRes, adjustmentsRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id, first_name, display_name, avatar_kind, avatar_value, is_active")
      .order("first_name"),
    admin.from("group_members").select("user_id, role"),
    admin.from("rounds").select("id").eq("season_id", seasonId),
    admin.from("point_adjustments").select("user_id, delta").eq("season_id", seasonId),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (membersRes.error) throw membersRes.error;
  if (roundsRes.error) throw roundsRes.error;
  if (adjustmentsRes.error) throw adjustmentsRes.error;

  const roleByUser = new Map<string, string>();
  for (const m of membersRes.data ?? []) {
    roleByUser.set(m.user_id as string, m.role as string);
  }

  const adjustmentByUser = new Map<string, number>();
  for (const a of adjustmentsRes.data ?? []) {
    const uid = a.user_id as string;
    adjustmentByUser.set(uid, (adjustmentByUser.get(uid) ?? 0) + (a.delta as number));
  }

  const pointsByUser = new Map<string, number>();
  const roundIds = (roundsRes.data ?? []).map((r) => r.id as string);
  if (roundIds.length > 0) {
    const { data: fixtures } = await admin
      .from("fixtures").select("id").in("round_id", roundIds);
    const fixtureIds = (fixtures ?? []).map((f) => f.id as string);

    if (fixtureIds.length > 0) {
      const { data: predictions } = await admin
        .from("predictions").select("id, user_id").in("fixture_id", fixtureIds);
      const userByPrediction = new Map<string, string>();
      for (const p of predictions ?? []) {
        userByPrediction.set(p.id as string, p.user_id as string);
      }
      if (userByPrediction.size > 0) {
        const { data: scores } = await admin
          .from("prediction_scores")
          .select("prediction_id, points")
          .in("prediction_id", [...userByPrediction.keys()]);
        for (const s of scores ?? []) {
          const uid = userByPrediction.get(s.prediction_id as string);
          if (!uid) continue;
          pointsByUser.set(uid, (pointsByUser.get(uid) ?? 0) + (s.points as number));
        }
      }
    }
  }

  return (profilesRes.data ?? []).map((p) => {
    const id = p.id as string;
    const adjustmentTotal = adjustmentByUser.get(id) ?? 0;
    return {
      id,
      firstName: p.first_name as string,
      displayName: p.display_name as string,
      avatarKind: p.avatar_kind as string,
      avatarValue: p.avatar_value as string,
      isActive: Boolean(p.is_active),
      role: roleByUser.get(id) ?? "player",
      seasonPoints: (pointsByUser.get(id) ?? 0) + adjustmentTotal,
      adjustmentTotal,
    };
  });
}

/** Les ajustements manuels de la saison, du plus récent au plus ancien. */
export async function loadAdjustments(limit = 50): Promise<AdminAdjustment[]> {
  const admin = createAdminClient();
  const seasonId = await currentSeasonId(admin);

  const { data, error } = await admin
    .from("point_adjustments")
    .select(`id, user_id, delta, reason, source, created_at,
             player:user_id (display_name),
             round:round_id (name),
             author:created_by (display_name)`)
    .eq("season_id", seasonId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const one = <T,>(v: unknown): T | null =>
    (Array.isArray(v) ? (v[0] ?? null) : (v ?? null)) as T | null;

  return (data ?? []).map((r) => ({
    id: r.id as Uuid,
    userId: r.user_id as Uuid,
    playerName: one<{ display_name: string }>(r.player)?.display_name ?? "Joueur inconnu",
    delta: r.delta as number,
    reason: r.reason as string,
    source: r.source as string,
    roundName: one<{ name: string }>(r.round)?.name ?? null,
    createdAt: r.created_at as string,
    authorName: one<{ display_name: string }>(r.author)?.display_name ?? "Administration",
  }));
}

export interface RulesetVersion {
  id: Uuid;
  version: number;
  label: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  points: { wrong: number; winner: number; winner_and_margin: number; exact_score: number };
  isCurrent: boolean;
}

/**
 * L'historique des barèmes de la saison.
 *
 * Un changement « à partir de maintenant » laisse une trace ici : on voit d'un
 * coup d'œil quel barème s'appliquait à quelle période, et donc pourquoi deux
 * journées ne rapportent pas la même chose.
 */
export async function loadRulesetVersions(): Promise<RulesetVersion[]> {
  const admin = createAdminClient();
  const seasonId = await currentSeasonId(admin);
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("scoring_rulesets")
    .select("id, version, label, effective_from, effective_to, rules")
    .eq("season_id", seasonId)
    .order("version", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((r) => {
    const effectiveTo = (r.effective_to as string | null) ?? null;
    return {
      id: r.id as Uuid,
      version: r.version as number,
      label: (r.label as string | null) ?? null,
      effectiveFrom: r.effective_from as string,
      effectiveTo,
      points: ((r.rules as Record<string, unknown>)?.points ?? {
        wrong: 0, winner: 0, winner_and_margin: 0, exact_score: 0,
      }) as RulesetVersion["points"],
      isCurrent: (r.effective_from as string) <= now && (effectiveTo === null || effectiveTo > now),
    };
  });
}
