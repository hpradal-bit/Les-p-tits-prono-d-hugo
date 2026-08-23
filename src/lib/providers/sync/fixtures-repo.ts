/**
 * Les lectures et écritures de la table `fixtures` pour la synchronisation.
 * Isolé ici pour que la logique (`reconcile.ts`) reste pure et testable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FixtureStatus } from "@/lib/types";
import type { FixturePatch, StoredFixture, StoredRound } from "../reconcile.ts";

const FIXTURE_COLUMNS =
  "id, round_id, home_team_id, away_team_id, kickoff_at, kickoff_confirmed, locks_at, " +
  "status, home_score, away_score, minute, venue, data_source";

interface FixtureRow {
  id: string;
  round_id: string;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
  kickoff_confirmed: boolean;
  locks_at: string;
  status: FixtureStatus;
  home_score: number | null;
  away_score: number | null;
  minute: number | null;
  venue: string | null;
  data_source: string | null;
}

function toStored(row: FixtureRow): StoredFixture {
  return {
    id: row.id,
    roundId: row.round_id,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    kickoffAt: new Date(row.kickoff_at).toISOString(),
    kickoffConfirmed: row.kickoff_confirmed,
    locksAt: new Date(row.locks_at).toISOString(),
    status: row.status,
    homeScore: row.home_score,
    awayScore: row.away_score,
    minute: row.minute,
    venue: row.venue,
    dataSource: row.data_source,
  };
}

/** Tous les matchs d'une saison. 182 lignes au maximum : une seule requête. */
export async function loadSeasonFixtures(
  sb: SupabaseClient,
  seasonId: string,
): Promise<StoredFixture[]> {
  const { data, error } = await sb
    .from("fixtures")
    .select(`${FIXTURE_COLUMNS}, rounds!inner(season_id)`)
    .eq("rounds.season_id", seasonId)
    .order("kickoff_at");
  if (error) throw error;
  return ((data ?? []) as unknown as FixtureRow[]).map(toStored);
}

/** Les matchs d'une saison dont le coup d'envoi tombe dans une plage. */
export async function loadFixturesBetween(
  sb: SupabaseClient,
  seasonId: string,
  fromIso: string,
  toIso: string,
): Promise<StoredFixture[]> {
  const { data, error } = await sb
    .from("fixtures")
    .select(`${FIXTURE_COLUMNS}, rounds!inner(season_id)`)
    .eq("rounds.season_id", seasonId)
    .gte("kickoff_at", fromIso)
    .lte("kickoff_at", toIso)
    .order("kickoff_at");
  if (error) throw error;
  return ((data ?? []) as unknown as FixtureRow[]).map(toStored);
}

export async function loadSeasonRounds(
  sb: SupabaseClient,
  seasonId: string,
): Promise<StoredRound[]> {
  const { data, error } = await sb
    .from("rounds")
    .select("id, number, name, starts_at, ends_at")
    .eq("season_id", seasonId)
    .order("number");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    number: r.number,
    name: r.name,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
  }));
}

export async function applyFixturePatch(
  sb: SupabaseClient,
  fixtureId: string,
  patch: FixturePatch,
): Promise<void> {
  const { error } = await sb
    .from("fixtures")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", fixtureId);
  if (error) throw error;
}

export interface NewFixture {
  round_id: string;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
  kickoff_confirmed: boolean;
  locks_at: string;
  status: FixtureStatus;
  venue: string | null;
  data_source: string;
}

export async function insertFixtures(
  sb: SupabaseClient,
  rows: NewFixture[],
): Promise<{ id: string; home_team_id: string; away_team_id: string }[]> {
  if (rows.length === 0) return [];
  const { data, error } = await sb
    .from("fixtures")
    .insert(rows.map((r) => ({ ...r, last_synced_at: new Date().toISOString() })))
    .select("id, home_team_id, away_team_id");
  if (error) throw error;
  return data ?? [];
}

export interface NewRound {
  season_id: string;
  number: number;
  name: string;
  starts_at: string;
  ends_at: string;
}

export async function insertRounds(
  sb: SupabaseClient,
  rows: NewRound[],
): Promise<StoredRound[]> {
  if (rows.length === 0) return [];
  const { data, error } = await sb
    .from("rounds")
    .insert(rows.map((r) => ({ ...r, status: "upcoming" })))
    .select("id, number, name, starts_at, ends_at");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    number: r.number,
    name: r.name,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
  }));
}
