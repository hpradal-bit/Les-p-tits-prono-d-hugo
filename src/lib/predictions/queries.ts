import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { loadRuleset, loadSettings, setting } from "@/lib/settings";
import type { Fixture, Round, Ruleset, Team, Uuid } from "@/lib/types";
import {
  exactScoreBudget,
  exactScoreVerdict,
  monthKeyOf,
  type ExactAttempt,
} from "./exact-score";
import { isLockedAt, nextLockAt } from "./lock";
import type { JourneyBoard, JourneyFixture, ParticipationRow, PredictionDraft } from "./types";

/* ---------------------------------------------------------------------------
   Lecture de l'écran « Ma journée ».

   Volumétrie : 6 joueurs, 13 journées, 91 matchs. On charge la saison entière
   en quatre petites requêtes plutôt que de bricoler des jointures imbriquées
   fragiles — c'est plus simple à lire, et à cette échelle c'est gratuit.
   --------------------------------------------------------------------------- */

interface TeamRow {
  id: string;
  code: string;
  name: string;
  short_name: string;
  city: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
}

interface FixtureRow {
  id: string;
  round_id: string;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
  kickoff_confirmed: boolean;
  locks_at: string;
  status: Fixture["status"];
  home_score: number | null;
  away_score: number | null;
  minute: number | null;
}

interface RoundRow {
  id: string;
  season_id: string;
  number: number;
  name: string;
  status: Round["status"];
  starts_at: string | null;
  ends_at: string | null;
}

interface PredictionRow {
  fixture_id: string;
  outcome: "home" | "draw" | "away";
  margin_bucket_id: string | null;
  margin_value: number | null;
  exact_home_score: number | null;
  exact_away_score: number | null;
  is_auto: boolean;
}

const FIXTURE_COLUMNS =
  "id, round_id, home_team_id, away_team_id, kickoff_at, kickoff_confirmed, locks_at, status, home_score, away_score, minute";

const PREDICTION_COLUMNS =
  "fixture_id, outcome, margin_bucket_id, margin_value, exact_home_score, exact_away_score, is_auto";

function toTeam(r: TeamRow): Team {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    shortName: r.short_name,
    city: r.city,
    logoUrl: r.logo_url,
    primaryColor: r.primary_color,
    secondaryColor: r.secondary_color,
  };
}

function toFixture(r: FixtureRow, teams: Map<string, Team>): Fixture | null {
  const home = teams.get(r.home_team_id);
  const away = teams.get(r.away_team_id);
  if (!home || !away) return null;
  return {
    id: r.id,
    roundId: r.round_id,
    homeTeam: home,
    awayTeam: away,
    kickoffAt: r.kickoff_at,
    kickoffConfirmed: r.kickoff_confirmed,
    locksAt: r.locks_at,
    status: r.status,
    homeScore: r.home_score,
    awayScore: r.away_score,
    minute: r.minute,
  };
}

function toRound(r: RoundRow): Round {
  return {
    id: r.id,
    number: r.number,
    name: r.name,
    status: r.status,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
  };
}

function toDraft(p: PredictionRow): PredictionDraft {
  return {
    outcome: p.outcome,
    marginBucketId: p.margin_bucket_id,
    marginValue: p.margin_value,
    exactHomeScore: p.exact_home_score,
    exactAwayScore: p.exact_away_score,
  };
}

/**
 * La journée à afficher par défaut : la première dont la fin n'est pas passée.
 * En fin de saison, on retombe sur la dernière journée jouée.
 */
export function pickCurrentRound(rounds: RoundRow[], now: Date): RoundRow | null {
  if (rounds.length === 0) return null;
  const upcoming = rounds.find((r) => {
    const end = r.ends_at ?? r.starts_at;
    return end === null || new Date(end).getTime() >= now.getTime();
  });
  return upcoming ?? rounds[rounds.length - 1];
}

async function loadParticipation(
  sb: SupabaseClient,
  roundId: Uuid,
): Promise<ParticipationRow[]> {
  const { data, error } = await sb.rpc("round_participation", { p_round_id: roundId });
  // Un joueur qui n'est pas encore rattaché au groupe se fait refuser : ce
  // n'est pas une erreur d'écran, on affiche simplement la liste vide.
  if (error || !data) return [];

  return (data as Array<Record<string, unknown>>).map((r) => ({
    userId: String(r.user_id),
    firstName: String(r.first_name ?? ""),
    displayName: String(r.display_name ?? ""),
    avatarKind: (r.avatar_kind as ParticipationRow["avatarKind"]) ?? "emoji",
    avatarValue: String(r.avatar_value ?? "🏉"),
    played: Number(r.played ?? 0),
    total: Number(r.total ?? 0),
    missing: Number(r.missing ?? 0),
  }));
}

export interface LoadJourneyOptions {
  /** Numéro de journée demandé ; à défaut, la journée en cours. */
  roundNumber?: number;
}

/**
 * Charge tout l'écran « Ma journée » pour le joueur connecté.
 * Renvoie null s'il n'y a pas de session : c'est à la page de rediriger.
 */
export async function loadJourneyBoard(
  opts: LoadJourneyOptions = {},
): Promise<JourneyBoard | null> {
  const sb = await createClient();
  const now = new Date();

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  // --- Saison active ---------------------------------------------------------
  const { data: season } = await sb
    .from("seasons")
    .select("id")
    .eq("status", "active")
    .order("starts_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!season) return null;
  const seasonId = season.id as string;

  // --- Journées --------------------------------------------------------------
  const { data: roundRows } = await sb
    .from("rounds")
    .select("id, season_id, number, name, status, starts_at, ends_at")
    .eq("season_id", seasonId)
    .order("number");
  const rounds = (roundRows ?? []) as RoundRow[];
  if (rounds.length === 0) return null;

  const asked =
    opts.roundNumber !== undefined
      ? rounds.find((r) => r.number === opts.roundNumber)
      : undefined;
  const roundRow = asked ?? pickCurrentRound(rounds, now);
  if (!roundRow) return null;

  const index = rounds.findIndex((r) => r.id === roundRow.id);
  const previous = index > 0 ? rounds[index - 1] : null;
  const next = index < rounds.length - 1 ? rounds[index + 1] : null;

  // --- Matchs de la saison (91 lignes : on charge tout, c'est plus simple) ---
  const { data: fixtureRows } = await sb
    .from("fixtures")
    .select(FIXTURE_COLUMNS)
    .in(
      "round_id",
      rounds.map((r) => r.id),
    )
    .order("kickoff_at");
  const seasonFixtures = (fixtureRows ?? []) as FixtureRow[];

  const roundFixtureRows = seasonFixtures.filter((f) => f.round_id === roundRow.id);

  // --- Clubs -----------------------------------------------------------------
  const teamIds = Array.from(
    new Set(roundFixtureRows.flatMap((f) => [f.home_team_id, f.away_team_id])),
  );
  const { data: teamRows } = await sb
    .from("teams")
    .select("id, code, name, short_name, city, logo_url, primary_color, secondary_color")
    .in("id", teamIds);
  const teams = new Map<string, Team>(
    ((teamRows ?? []) as TeamRow[]).map((t) => [t.id, toTeam(t)]),
  );

  // --- Mes pronostics (RLS : les miens, et ceux des autres seulement une fois
  //     le match verrouillé — on ne demande que les miens de toute façon) ----
  const { data: predictionRows } = await sb
    .from("predictions")
    .select(PREDICTION_COLUMNS)
    .eq("user_id", user.id);
  const myPredictions = new Map<string, PredictionRow>(
    ((predictionRows ?? []) as PredictionRow[]).map((p) => [p.fixture_id, p]),
  );

  // --- Barème & réglages -----------------------------------------------------
  const ruleset: Ruleset = await loadRuleset(sb, seasonId);
  const settings = await loadSettings(sb);
  const timeZone = setting(settings, "timezone", "Europe/Paris");

  // --- Scores exacts déjà tentés sur la saison ------------------------------
  const attempts: ExactAttempt[] = seasonFixtures
    .filter((f) => myPredictions.get(f.id)?.exact_home_score != null)
    .map((f) => ({
      fixtureId: f.id,
      roundId: f.round_id,
      seasonId,
      monthKey: monthKeyOf(f.kickoff_at, timeZone),
    }));

  // --- Assemblage ------------------------------------------------------------
  const fixtures: JourneyFixture[] = roundFixtureRows
    .map((row) => {
      const fixture = toFixture(row, teams);
      if (!fixture) return null;
      const prediction = myPredictions.get(row.id) ?? null;

      const monthKey = monthKeyOf(row.kickoff_at, timeZone);

      return {
        fixture,
        draft: prediction ? toDraft(prediction) : null,
        isAuto: prediction?.is_auto ?? false,
        isLocked: isLockedAt(row.locks_at, now),
        exactScore: exactScoreVerdict(ruleset, attempts, {
          fixtureId: row.id,
          roundId: row.round_id,
          seasonId,
          monthKey,
        }),
        monthKey,
      } satisfies JourneyFixture;
    })
    .filter((f): f is JourneyFixture => f !== null);

  const open = fixtures.filter((f) => !f.isLocked);
  const firstOfRound = roundFixtureRows[0];

  const budget = exactScoreBudget(ruleset, attempts, {
    fixtureId: firstOfRound?.id ?? "",
    roundId: roundRow.id,
    seasonId,
    monthKey: firstOfRound
      ? monthKeyOf(firstOfRound.kickoff_at, timeZone)
      : monthKeyOf(now.toISOString(), timeZone),
  });

  return {
    userId: user.id,
    seasonId,
    round: toRound(roundRow),
    previousRound: previous
      ? { id: previous.id, number: previous.number, name: previous.name }
      : null,
    nextRound: next ? { id: next.id, number: next.number, name: next.name } : null,
    fixtures,
    ruleset,
    exactScoreBudget: budget,
    otherAttempts: attempts.filter((a) => a.roundId !== roundRow.id),
    remainingToPlay: open.filter((f) => f.draft === null).length,
    openCount: open.length,
    nextLockAt: nextLockAt(
      fixtures.map((f) => f.fixture.locksAt),
      now,
    ),
    hasProvisionalKickoffs: fixtures.some((f) => !f.fixture.kickoffConfirmed),
    participation: await loadParticipation(sb, roundRow.id),
    timeZone,
    serverNow: now.toISOString(),
  };
}
