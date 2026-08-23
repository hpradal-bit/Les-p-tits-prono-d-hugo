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
