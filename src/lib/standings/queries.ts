/**
 * Lecture des données du classement et du Match Center.
 *
 * Serveur uniquement, et toujours avec le client soumis à RLS : c'est la base
 * qui décide de ce qui est visible. Les jointures sont volontairement faites
 * en mémoire — 6 joueurs, 91 matchs par saison : quelques centaines de lignes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FixtureStatus,
  MatchOutcome,
  RoundStatus,
  ScoreLevel,
  Team,
  Uuid,
} from "@/lib/types";
import type {
  AdjustmentEntry,
  BonusEntry,
  PlayerRef,
  RoundRef,
  ScoreEntry,
  StandingsInput,
} from "./engine";
import { explainScore, levelFromBreakdown, parseBreakdown } from "./breakdown";

export interface SeasonRef {
  id: Uuid;
  label: string;
  competitionName: string;
}

export interface RoundInfo extends RoundRef {
  status: RoundStatus;
}

type CompetitionRow = { name: string } | { name: string }[] | null;

function competitionName(row: CompetitionRow): string {
  const one = Array.isArray(row) ? row[0] : row;
  return one?.name ?? "Compétition";
}

/**
 * La saison de la compétition portée par une ligue donnée.
 *
 * Passer par la ligue plutôt que par un code de compétition en dur permet à
 * plusieurs ligues indépendantes de vivre en même temps (règle n° 5) : la
 * ligue est la seule porte d'entrée, jamais une compétition par défaut.
 */
export async function loadActiveSeason(sb: SupabaseClient, leagueId: Uuid): Promise<SeasonRef | null> {
  const { data: league, error: leagueError } = await sb
    .from("leagues")
    .select("competition_id, competitions:competition_id!inner(name)")
    .eq("id", leagueId)
    .maybeSingle();
  if (leagueError) throw leagueError;
  if (!league) return null;

  const { data, error } = await sb
    .from("seasons")
    .select("id, label")
    .eq("competition_id", league.competition_id)
    .order("starts_on", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = data?.[0] as { id: string; label: string } | undefined;
  return row
    ? { id: row.id, label: row.label, competitionName: competitionName(league.competitions as CompetitionRow) }
    : null;
}

/** La saison d'une journée connue — pour retrouver le contexte d'un match déjà identifié. */
export async function loadSeasonForRound(sb: SupabaseClient, roundId: Uuid): Promise<SeasonRef | null> {
  const { data, error } = await sb.from("rounds").select("season_id").eq("id", roundId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return loadSeasonById(sb, data.season_id as string);
}

/** La saison d'un identifiant connu — pour retrouver le contexte d'une journée déjà choisie. */
export async function loadSeasonById(sb: SupabaseClient, seasonId: Uuid): Promise<SeasonRef | null> {
  const { data, error } = await sb
    .from("seasons")
    .select("id, label, competitions:competition_id!inner(name)")
    .eq("id", seasonId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    label: data.label as string,
    competitionName: competitionName(data.competitions as CompetitionRow),
  };
}

interface RawScoreRow {
  prediction_id: string;
  points: number | null;
  breakdown: unknown;
  is_official: boolean | null;
  predictions: { user_id: string; fixture_id: string } | null;
}

interface RawFixtureRow {
  id: string;
  round_id: string;
  status: FixtureStatus;
  kickoff_at: string;
}

interface RawBonusRow {
  user_id: string;
  points: number | null;
  bonus_questions: { season_id: string; round_id: string | null } | null;
}

interface RawProfileRow {
  id: string;
  first_name: string;
  display_name: string;
  avatar_kind: PlayerRef["avatarKind"];
  avatar_value: string;
}

/** Supabase renvoie une relation « vers un » comme objet, parfois comme tableau. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toPlayer(row: RawProfileRow): PlayerRef {
  return {
    userId: row.id,
    firstName: row.first_name,
    displayName: row.display_name,
    avatarKind: row.avatar_kind,
    avatarValue: row.avatar_value,
  };
}

const PROFILE_COLUMNS = "id, first_name, display_name, avatar_kind, avatar_value";
const TEAM_COLUMNS =
  "id, code, name, short_name, city, logo_url, primary_color, secondary_color";

export interface StandingsData extends StandingsInput {
  season: SeasonRef;
  roundsDetail: RoundInfo[];
}

interface RawMemberRow {
  profiles: (RawProfileRow & { is_active: boolean }) | (RawProfileRow & { is_active: boolean })[];
}

/**
 * Tout ce dont le moteur a besoin, pour UNE ligue. Le filtrage live/officiel
 * n'a pas lieu ici : on charge une fois, le moteur applique la portée
 * demandée. Les joueurs viennent de `league_members`, pas de tous les profils
 * actifs de l'application — sans ce filtre, le classement d'une ligue
 * afficherait aussi les membres d'une autre ligue sur la même compétition.
 */
export async function loadStandingsData(
  sb: SupabaseClient,
  season: SeasonRef,
  leagueId: Uuid,
): Promise<StandingsData> {
  const [roundsRes, membersRes, adjustmentsRes] = await Promise.all([
    sb
      .from("rounds")
      .select("id, number, name, status")
      .eq("season_id", season.id)
      .order("number"),
    sb.from("league_members").select(`profiles!inner(${PROFILE_COLUMNS}, is_active)`).eq("league_id", leagueId),
    sb
      .from("point_adjustments")
      .select("user_id, round_id, delta")
      .eq("season_id", season.id),
  ]);

  if (roundsRes.error) throw roundsRes.error;
  if (membersRes.error) throw membersRes.error;
  if (adjustmentsRes.error) throw adjustmentsRes.error;

  const roundsDetail: RoundInfo[] = (
    (roundsRes.data ?? []) as Array<{
      id: string;
      number: number;
      name: string;
      status: RoundStatus;
    }>
  ).map((r) => ({ id: r.id, number: r.number, name: r.name, status: r.status }));

  const roundIds = roundsDetail.map((r) => r.id);
  const players: PlayerRef[] = ((membersRes.data ?? []) as unknown as RawMemberRow[])
    .map((row) => (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles))
    .filter((p): p is RawProfileRow & { is_active: boolean } => p != null && p.is_active)
    .map(toPlayer)
    .sort((a, b) => a.firstName.localeCompare(b.firstName, "fr"));

  const [fixturesRes, scoresRes, bonusRes] = await Promise.all([
    roundIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : sb.from("fixtures").select("id, round_id, status, kickoff_at").in("round_id", roundIds),
    sb
      .from("prediction_scores")
      .select(
        "prediction_id, points, breakdown, is_official, predictions!inner(user_id, fixture_id)",
      ),
    sb
      .from("bonus_scores")
      .select("user_id, points, bonus_questions!inner(season_id, round_id)"),
  ]);

  if (fixturesRes.error) throw fixturesRes.error;
  if (scoresRes.error) throw scoresRes.error;
  if (bonusRes.error) throw bonusRes.error;

  const fixtures = new Map<string, RawFixtureRow>();
  for (const f of (fixturesRes.data ?? []) as unknown as RawFixtureRow[]) {
    fixtures.set(f.id, f);
  }

  const entries: ScoreEntry[] = [];
  for (const row of (scoresRes.data ?? []) as unknown as RawScoreRow[]) {
    const prediction = one(row.predictions);
    if (!prediction) continue;
    const fixture = fixtures.get(prediction.fixture_id);
    if (!fixture) continue; // match d'une autre saison
    entries.push({
      userId: prediction.user_id,
      roundId: fixture.round_id,
      fixtureId: fixture.id,
      kickoffAt: fixture.kickoff_at,
      fixtureStatus: fixture.status,
      points: row.points ?? 0,
      level: levelFromBreakdown(parseBreakdown(row.breakdown)),
    });
  }

  const adjustments: AdjustmentEntry[] = (
    (adjustmentsRes.data ?? []) as Array<{
      user_id: string;
      round_id: string | null;
      delta: number;
    }>
  ).map((a) => ({ userId: a.user_id, roundId: a.round_id, delta: a.delta }));

  const bonuses: BonusEntry[] = [];
  for (const row of (bonusRes.data ?? []) as unknown as RawBonusRow[]) {
    const question = one(row.bonus_questions);
    if (!question || question.season_id !== season.id) continue;
    bonuses.push({
      userId: row.user_id,
      roundId: question.round_id,
      points: row.points ?? 0,
    });
  }

  return {
    season,
    players,
    rounds: roundsDetail.map((r) => ({ id: r.id, number: r.number, name: r.name })),
    roundsDetail,
    entries,
    adjustments,
    bonuses,
  };
}

/* -------------------------------------------------------------------------- */
/*  Classement sportif réel de la compétition                                  */
/* -------------------------------------------------------------------------- */

interface RawTeamRow {
  id: string;
  code: string;
  name: string;
  short_name: string;
  city: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
}

function toTeam(row: RawTeamRow): Team {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    shortName: row.short_name,
    city: row.city,
    logoUrl: row.logo_url,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
  };
}

export interface CompetitionStandingRow {
  position: number;
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  bonusOffensive: number;
  bonusDefensive: number;
  points: number;
  updatedAt: string;
}

export async function loadCompetitionStandings(
  sb: SupabaseClient,
  seasonId: Uuid,
): Promise<CompetitionStandingRow[]> {
  const { data, error } = await sb
    .from("competition_standings")
    .select(
      "team_id, position, played, won, drawn, lost, points_for, points_against, bonus_offensive, bonus_defensive, points, updated_at",
    )
    .eq("season_id", seasonId)
    .order("position");
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    team_id: string;
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    points_for: number;
    points_against: number;
    bonus_offensive: number;
    bonus_defensive: number;
    points: number;
    updated_at: string;
  }>;
  if (rows.length === 0) return [];

  const { data: teamRows, error: teamError } = await sb
    .from("teams")
    .select(TEAM_COLUMNS)
    .in(
      "id",
      rows.map((r) => r.team_id),
    );
  if (teamError) throw teamError;

  const teams = new Map<string, Team>();
  for (const t of (teamRows ?? []) as unknown as RawTeamRow[]) teams.set(t.id, toTeam(t));

  return rows
    .filter((r) => teams.has(r.team_id))
    .map((r) => ({
      position: r.position,
      team: teams.get(r.team_id)!,
      played: r.played,
      won: r.won,
      drawn: r.drawn,
      lost: r.lost,
      pointsFor: r.points_for,
      pointsAgainst: r.points_against,
      bonusOffensive: r.bonus_offensive,
      bonusDefensive: r.bonus_defensive,
      points: r.points,
      updatedAt: r.updated_at,
    }));
}

/* -------------------------------------------------------------------------- */
/*  Matchs d'une journée (passerelle vers le Match Center)                     */
/* -------------------------------------------------------------------------- */

export interface RoundFixture {
  id: Uuid;
  homeTeam: Team;
  awayTeam: Team;
  kickoffAt: string;
  kickoffConfirmed: boolean;
  status: FixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
}

export async function loadRoundFixtures(
  sb: SupabaseClient,
  roundId: Uuid,
): Promise<RoundFixture[]> {
  const { data, error } = await sb
    .from("fixtures")
    .select(
      "id, home_team_id, away_team_id, kickoff_at, kickoff_confirmed, status, home_score, away_score, minute",
    )
    .eq("round_id", roundId)
    .order("kickoff_at");
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    home_team_id: string;
    away_team_id: string;
    kickoff_at: string;
    kickoff_confirmed: boolean | null;
    status: FixtureStatus;
    home_score: number | null;
    away_score: number | null;
    minute: number | null;
  }>;
  if (rows.length === 0) return [];

  const teamIds = [...new Set(rows.flatMap((r) => [r.home_team_id, r.away_team_id]))];
  const { data: teamRows, error: teamError } = await sb
    .from("teams")
    .select(TEAM_COLUMNS)
    .in("id", teamIds);
  if (teamError) throw teamError;

  const teams = new Map<string, Team>();
  for (const t of (teamRows ?? []) as unknown as RawTeamRow[]) teams.set(t.id, toTeam(t));

  return rows
    .filter((r) => teams.has(r.home_team_id) && teams.has(r.away_team_id))
    .map((r) => ({
      id: r.id,
      homeTeam: teams.get(r.home_team_id)!,
      awayTeam: teams.get(r.away_team_id)!,
      kickoffAt: r.kickoff_at,
      kickoffConfirmed: r.kickoff_confirmed ?? false,
      status: r.status,
      homeScore: r.home_score,
      awayScore: r.away_score,
      minute: r.minute,
    }));
}

/* -------------------------------------------------------------------------- */
/*  Match Center                                                               */
/* -------------------------------------------------------------------------- */

export interface MatchFixture {
  id: Uuid;
  roundId: Uuid;
  roundName: string;
  roundNumber: number;
  homeTeam: Team;
  awayTeam: Team;
  kickoffAt: string;
  kickoffConfirmed: boolean;
  locksAt: string;
  status: FixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  venue: string | null;
}

export interface MatchPrediction {
  player: PlayerRef;
  outcome: MatchOutcome;
  marginBucketLabel: string | null;
  marginValue: number | null;
  exactHomeScore: number | null;
  exactAwayScore: number | null;
  isAuto: boolean;
  /** `null` tant que le pronostic n'a pas été noté. */
  score: { points: number; level: ScoreLevel; reason: string } | null;
}

export interface MatchCenterData {
  fixture: MatchFixture;
  /** Les pronostics du groupe. Vide tant que le match n'est pas verrouillé. */
  predictions: MatchPrediction[];
  /** Le pronostic du joueur connecté, visible même avant le verrouillage. */
  mine: MatchPrediction | null;
  isLocked: boolean;
  /**
   * La ligue du spectateur pour la compétition de ce match — pour relier vers
   * la bonne bulle de /journee. `null` si le spectateur n'appartient à aucune
   * ligue sur cette compétition (rare : il ne devrait alors même pas voir ce
   * match, RLS y veille pour les pronostics).
   */
  leagueId: Uuid | null;
}

export async function loadMatchCenter(
  sb: SupabaseClient,
  fixtureId: Uuid,
  viewerId: Uuid | null,
): Promise<MatchCenterData | null> {
  const { data: fixtureRow, error } = await sb
    .from("fixtures")
    .select(
      "id, round_id, home_team_id, away_team_id, kickoff_at, kickoff_confirmed, locks_at, status, home_score, away_score, minute, venue",
    )
    .eq("id", fixtureId)
    .maybeSingle();
  if (error) throw error;
  if (!fixtureRow) return null;

  const raw = fixtureRow as {
    id: string;
    round_id: string;
    home_team_id: string;
    away_team_id: string;
    kickoff_at: string;
    kickoff_confirmed: boolean | null;
    locks_at: string;
    status: FixtureStatus;
    home_score: number | null;
    away_score: number | null;
    minute: number | null;
    venue: string | null;
  };

  const [teamsRes, roundRes, predictionsRes] = await Promise.all([
    sb.from("teams").select(TEAM_COLUMNS).in("id", [raw.home_team_id, raw.away_team_id]),
    sb.from("rounds").select("id, number, name, season_id").eq("id", raw.round_id).maybeSingle(),
    sb
      .from("predictions")
      .select(
        "id, user_id, outcome, margin_bucket_id, margin_value, exact_home_score, exact_away_score, is_auto",
      )
      .eq("fixture_id", fixtureId),
  ]);

  if (teamsRes.error) throw teamsRes.error;
  if (roundRes.error) throw roundRes.error;
  if (predictionsRes.error) throw predictionsRes.error;

  const teams = new Map<string, Team>();
  for (const t of (teamsRes.data ?? []) as unknown as RawTeamRow[]) teams.set(t.id, toTeam(t));
  const homeTeam = teams.get(raw.home_team_id);
  const awayTeam = teams.get(raw.away_team_id);
  if (!homeTeam || !awayTeam) return null;

  const round = roundRes.data as
    | { id: string; number: number; name: string; season_id: string }
    | null;

  // La ligue du spectateur pour cette compétition, pour relier « Faire mon
  // prono » vers la bonne bulle : sans elle, ce lien retomberait sur une
  // ligue arbitraire. Une compétition pouvant héberger plusieurs ligues
  // indépendantes, on ne peut pas la déduire du seul match — seulement de
  // « quelle ligue, sur cette compétition, le spectateur partage-t-il ? ».
  let leagueId: Uuid | null = null;
  if (viewerId && round?.season_id) {
    const { data: seasonRow } = await sb
      .from("seasons")
      .select("competition_id")
      .eq("id", round.season_id)
      .maybeSingle();
    if (seasonRow) {
      const { data: membership } = await sb
        .from("league_members")
        .select("league_id, leagues!inner(competition_id)")
        .eq("user_id", viewerId)
        .eq("leagues.competition_id", seasonRow.competition_id)
        .limit(1)
        .maybeSingle();
      leagueId = (membership?.league_id as string | undefined) ?? null;
    }
  }

  const fixture: MatchFixture = {
    id: raw.id,
    roundId: raw.round_id,
    roundName: round?.name ?? "",
    roundNumber: round?.number ?? 0,
    homeTeam,
    awayTeam,
    kickoffAt: raw.kickoff_at,
    kickoffConfirmed: raw.kickoff_confirmed ?? false,
    locksAt: raw.locks_at,
    status: raw.status,
    homeScore: raw.home_score,
    awayScore: raw.away_score,
    minute: raw.minute,
    venue: raw.venue,
  };

  const predictionRows = (predictionsRes.data ?? []) as Array<{
    id: string;
    user_id: string;
    outcome: MatchOutcome;
    margin_bucket_id: string | null;
    margin_value: number | null;
    exact_home_score: number | null;
    exact_away_score: number | null;
    is_auto: boolean;
  }>;

  const bucketIds = [
    ...new Set(
      predictionRows.map((p) => p.margin_bucket_id).filter((id): id is string => id !== null),
    ),
  ];
  const userIds = [...new Set(predictionRows.map((p) => p.user_id))];
  const predictionIds = predictionRows.map((p) => p.id);

  const [bucketsRes, profilesRes, scoresRes] = await Promise.all([
    bucketIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : sb.from("margin_buckets").select("id, label").in("id", bucketIds),
    userIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : sb.from("profiles").select(PROFILE_COLUMNS).in("id", userIds),
    predictionIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : sb
          .from("prediction_scores")
          .select("prediction_id, points, breakdown")
          .in("prediction_id", predictionIds),
  ]);

  if (bucketsRes.error) throw bucketsRes.error;
  if (profilesRes.error) throw profilesRes.error;
  if (scoresRes.error) throw scoresRes.error;

  const buckets = new Map<string, string>();
  for (const b of (bucketsRes.data ?? []) as Array<{ id: string; label: string }>) {
    buckets.set(b.id, b.label);
  }

  const profiles = new Map<string, PlayerRef>();
  for (const p of (profilesRes.data ?? []) as RawProfileRow[]) {
    profiles.set(p.id, toPlayer(p));
  }

  const scores = new Map<string, { points: number; breakdown: unknown }>();
  for (const s of (scoresRes.data ?? []) as Array<{
    prediction_id: string;
    points: number | null;
    breakdown: unknown;
  }>) {
    scores.set(s.prediction_id, { points: s.points ?? 0, breakdown: s.breakdown });
  }

  const predictions: MatchPrediction[] = predictionRows.map((p) => {
    const rawScore = scores.get(p.id);
    const breakdown = rawScore ? parseBreakdown(rawScore.breakdown) : null;
    return {
      player: profiles.get(p.user_id) ?? {
        userId: p.user_id,
        firstName: "Joueur",
        displayName: "Joueur",
        avatarKind: "emoji" as const,
        avatarValue: "🏉",
      },
      outcome: p.outcome,
      marginBucketLabel: p.margin_bucket_id ? (buckets.get(p.margin_bucket_id) ?? null) : null,
      marginValue: p.margin_value,
      exactHomeScore: p.exact_home_score,
      exactAwayScore: p.exact_away_score,
      isAuto: p.is_auto,
      score:
        rawScore && breakdown
          ? {
              points: rawScore.points,
              level: levelFromBreakdown(breakdown),
              reason: explainScore(breakdown),
            }
          : null,
    };
  });

  predictions.sort((a, b) => {
    const pa = a.score?.points ?? -1;
    const pb = b.score?.points ?? -1;
    if (pa !== pb) return pb - pa;
    return a.player.firstName.localeCompare(b.player.firstName, "fr");
  });

  const isLocked = new Date(fixture.locksAt).getTime() <= Date.now();

  return {
    fixture,
    // Avant le verrouillage, RLS ne renvoie que le pronostic du joueur connecté.
    // On ne l'affiche pas dans la liste du groupe : ce serait mentir sur le secret.
    predictions: isLocked ? predictions : [],
    mine: viewerId ? (predictions.find((p) => p.player.userId === viewerId) ?? null) : null,
    isLocked,
    leagueId,
  };
}

/* -------------------------------------------------------------------------- */
/*  Historique du classement (snapshots par journée)                           */
/* -------------------------------------------------------------------------- */

export interface StandingsHistoryPoint {
  userId: string;
  firstName: string;
  positions: (number | null)[];
}

export interface StandingsHistory {
  roundLabels: string[];
  players: StandingsHistoryPoint[];
}

export async function loadStandingsHistory(
  sb: SupabaseClient,
  seasonId: Uuid,
): Promise<StandingsHistory> {
  const { data, error } = await sb
    .from("standings_snapshots")
    .select("round_id, standings")
    .eq("season_id", seasonId)
    .eq("kind", "overall")
    .order("frozen_at");
  if (error) throw error;

  const snapshots = (data ?? []) as Array<{
    round_id: string;
    standings: Array<{ position: number; player: { userId: string; firstName: string } }>;
  }>;

  if (snapshots.length === 0) return { roundLabels: [], players: [] };

  const { data: roundRows, error: roundError } = await sb
    .from("rounds")
    .select("id, number, name")
    .eq("season_id", seasonId)
    .order("number");
  if (roundError) throw roundError;

  const roundMap = new Map<string, { number: number; name: string }>();
  for (const r of (roundRows ?? []) as Array<{ id: string; number: number; name: string }>) {
    roundMap.set(r.id, r);
  }

  const orderedRoundIds = snapshots
    .map((s) => s.round_id)
    .filter((id) => roundMap.has(id))
    .sort((a, b) => (roundMap.get(a)!.number - roundMap.get(b)!.number));

  const roundLabels = orderedRoundIds.map((id) => `J${roundMap.get(id)!.number}`);

  const allPlayerIds = new Set<string>();
  const playerNames = new Map<string, string>();
  for (const snap of snapshots) {
    for (const row of snap.standings) {
      allPlayerIds.add(row.player.userId);
      if (!playerNames.has(row.player.userId)) {
        playerNames.set(row.player.userId, row.player.firstName);
      }
    }
  }

  const snapshotByRound = new Map(snapshots.map((s) => [s.round_id, s.standings]));

  const players: StandingsHistoryPoint[] = [...allPlayerIds].map((userId) => ({
    userId,
    firstName: playerNames.get(userId) ?? "Joueur",
    positions: orderedRoundIds.map((roundId) => {
      const snap = snapshotByRound.get(roundId);
      const row = snap?.find((r) => r.player.userId === userId);
      return row?.position ?? null;
    }),
  }));

  return { roundLabels, players };
}
