/**
 * Lecture des ligues. Toujours avec le client soumis à RLS : `leagues_read` et
 * `league_members_read` ne renvoient déjà que ce que l'appelant a le droit de
 * voir (règle n° 3 — la base applique le secret, pas l'écran).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { League, LeagueMemberRow, LeagueMembership, Uuid } from "./types.ts";

interface CompetitionRow {
  code: string;
  name: string;
}

function competitionOf(row: CompetitionRow | CompetitionRow[] | null): CompetitionRow {
  const one = Array.isArray(row) ? row[0] : row;
  return one ?? { code: "?", name: "Compétition" };
}

/** Les ligues du joueur connecté, triées par ancienneté d'adhésion. */
export async function loadMyLeagues(
  sb: SupabaseClient,
  userId: Uuid,
): Promise<LeagueMembership[]> {
  const { data, error } = await sb
    .from("league_members")
    .select(
      "role, joined_at, leagues!inner(id, name, competitions:competition_id!inner(code, name))",
    )
    .eq("user_id", userId)
    .order("joined_at");
  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    role: "player" | "admin";
    joined_at: string;
    leagues: { id: string; name: string; competitions: CompetitionRow | CompetitionRow[] } | Array<{
      id: string;
      name: string;
      competitions: CompetitionRow | CompetitionRow[];
    }>;
  }>).map((row) => {
    const league = Array.isArray(row.leagues) ? row.leagues[0] : row.leagues;
    const competition = competitionOf(league.competitions);
    return {
      leagueId: league.id,
      leagueName: league.name,
      competitionCode: competition.code,
      competitionName: competition.name,
      role: row.role,
      joinedAt: row.joined_at,
    };
  });
}

/** Une ligue précise, si l'appelant en est membre (sinon RLS renvoie zéro ligne). */
export async function loadLeagueById(
  sb: SupabaseClient,
  leagueId: Uuid,
): Promise<League | null> {
  const { data, error } = await sb
    .from("leagues")
    .select(
      "id, competition_id, name, logo_url, slogan, join_key, created_by, created_at, competitions:competition_id!inner(code, name)",
    )
    .eq("id", leagueId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const competition = competitionOf(data.competitions as CompetitionRow | CompetitionRow[]);
  return {
    id: data.id,
    competitionId: data.competition_id,
    competitionCode: competition.code,
    competitionName: competition.name,
    name: data.name,
    logoUrl: data.logo_url,
    slogan: data.slogan,
    joinKey: data.join_key,
    createdBy: data.created_by,
    createdAt: data.created_at,
  };
}

/** Les membres d'une ligue, pour l'écran « Ma ligue ». */
export async function loadLeagueMembers(
  sb: SupabaseClient,
  leagueId: Uuid,
): Promise<LeagueMemberRow[]> {
  const { data, error } = await sb
    .from("league_members")
    .select(
      "user_id, role, joined_at, profiles!inner(display_name, first_name, avatar_kind, avatar_value)",
    )
    .eq("league_id", leagueId)
    .order("joined_at");
  if (error) throw error;

  type ProfileRow = {
    display_name: string;
    first_name: string;
    avatar_kind: "emoji" | "photo" | "club";
    avatar_value: string;
  };

  return ((data ?? []) as unknown as Array<{
    user_id: string;
    role: "player" | "admin";
    joined_at: string;
    profiles: ProfileRow | ProfileRow[];
  }>).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      userId: row.user_id,
      displayName: profile.display_name,
      firstName: profile.first_name,
      avatarKind: profile.avatar_kind,
      avatarValue: profile.avatar_value,
      role: row.role,
      joinedAt: row.joined_at,
    };
  });
}

export interface CatalogueCompetition {
  code: string;
  name: string;
  playable: boolean;
}

export interface CatalogueSport {
  code: string;
  name: string;
  competitions: CatalogueCompetition[];
}

/**
 * Le catalogue complet « sport → compétitions », pour l'écran « Rejoindre une
 * ligue ». Les compétitions `is_active=false` sont purement décoratives : le
 * catalogue les montre, l'écran les affiche verrouillées et non cliquables.
 */
export async function loadCatalogue(sb: SupabaseClient): Promise<CatalogueSport[]> {
  const { data, error } = await sb
    .from("sports")
    .select("code, name, competitions(code, name, is_active)")
    .order("name");
  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    code: string;
    name: string;
    competitions: Array<{ code: string; name: string; is_active: boolean }>;
  }>).map((sport) => ({
    code: sport.code,
    name: sport.name,
    competitions: (sport.competitions ?? [])
      .map((c) => ({ code: c.code, name: c.name, playable: c.is_active }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr")),
  }));
}

/** Les compétitions réellement jouables (celles qui ont au moins une ligue possible). */
export async function loadJoinableCompetitions(
  sb: SupabaseClient,
): Promise<Array<{ code: string; name: string; sportCode: string; sportName: string }>> {
  const { data, error } = await sb
    .from("competitions")
    .select("code, name, sports:sport_id!inner(code, name)")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    code: string;
    name: string;
    sports: { code: string; name: string } | { code: string; name: string }[];
  }>).map((row) => {
    const sport = Array.isArray(row.sports) ? row.sports[0] : row.sports;
    return { code: row.code, name: row.name, sportCode: sport.code, sportName: sport.name };
  });
}
