import type { SupabaseClient } from "@supabase/supabase-js";
import { loadActiveSeason, loadStandingsData } from "@/lib/standings/queries";
import { computeStandings } from "@/lib/standings/engine";
import { pickScenario, type CelebrationScenario } from "./scenario";
import type { Uuid } from "@/lib/types";

export interface CelebrationPayload {
  roundId: Uuid;
  roundName: string;
  scenario: CelebrationScenario;
  points: number;
  totalPlayers: number;
}

/**
 * La dernière journée réglée que ce joueur n'a pas encore vue fêtée, pour
 * cette ligue — ou `null` s'il n'y a rien à montrer. Ne recalcule aucun
 * point : `computeStandings` est le même moteur que le classement.
 */
export async function loadPendingCelebration(
  sb: SupabaseClient,
  leagueId: Uuid,
  userId: Uuid,
): Promise<CelebrationPayload | null> {
  const season = await loadActiveSeason(sb, leagueId);
  if (!season) return null;

  const data = await loadStandingsData(sb, season, leagueId);
  const settled = data.roundsDetail
    .filter((r) => r.status === "settled")
    .sort((a, b) => b.number - a.number);
  if (settled.length === 0) return null;
  const latest = settled[0];

  const { data: alreadySeen } = await sb
    .from("celebration_views")
    .select("round_id")
    .eq("user_id", userId)
    .eq("round_id", latest.id)
    .eq("league_id", leagueId)
    .maybeSingle();
  if (alreadySeen) return null;

  const table = computeStandings(data, { kind: "round", scope: "live", roundId: latest.id });
  const totalPlayers = table.rows.length;
  const row = table.rows.find((r) => r.player.userId === userId);
  if (!row) return null;

  const scenario = pickScenario(
    { position: row.position, movement: row.movement, exactScoreCount: row.counts.exact_score },
    totalPlayers,
  );

  return {
    roundId: latest.id,
    roundName: latest.name,
    scenario,
    points: row.points,
    totalPlayers,
  };
}
