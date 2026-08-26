import { createClient } from "@/lib/supabase/server";
import { loadActiveSeason } from "@/lib/standings/queries";
import type { StandingsRow } from "@/lib/standings/engine";
import type { Uuid } from "@/lib/types";

interface DebriefData {
  roundName: string;
  bestPlayer: string | null;
  bestPoints: number | null;
  leader: string | null;
  leaderPoints: number | null;
  exactScores: number;
  biggestDrop: string | null;
  dropFrom: number | null;
  dropTo: number | null;
  worstMatch: string | null;
  worstMatchErrors: number | null;
}

export async function loadLastDebrief(leagueId: Uuid): Promise<DebriefData | null> {
  const sb = await createClient();

  // La saison de la ligue, jamais « la » saison active : deux ligues sur des
  // compétitions différentes peuvent vivre en même temps (règle n° 5).
  const season = await loadActiveSeason(sb, leagueId);
  if (!season) return null;
  const seasonId = season.id;

  const { data: roundSnap } = await sb
    .from("standings_snapshots")
    .select("round_id, standings")
    .eq("season_id", seasonId)
    .eq("kind", "round")
    .order("frozen_at", { ascending: false })
    .limit(1);

  const { data: overallSnap } = await sb
    .from("standings_snapshots")
    .select("round_id, standings")
    .eq("season_id", seasonId)
    .eq("kind", "overall")
    .order("frozen_at", { ascending: false })
    .limit(1);

  const roundSnapshot = (roundSnap as Array<{ round_id: string; standings: StandingsRow[] }> | null)?.[0];
  const overallSnapshot = (overallSnap as Array<{ round_id: string; standings: StandingsRow[] }> | null)?.[0];
  if (!roundSnapshot) return null;

  const { data: roundRow } = await sb
    .from("rounds")
    .select("name")
    .eq("id", roundSnapshot.round_id)
    .maybeSingle();

  const roundName = (roundRow as { name: string } | null)?.name ?? "Journée";
  const roundRows = roundSnapshot.standings;
  const overallRows = overallSnapshot?.standings ?? [];

  const best = roundRows[0] ?? null;
  const leader = overallRows[0] ?? null;

  let exactScores = 0;
  for (const row of roundRows) {
    exactScores += row.counts?.exact_score ?? 0;
  }

  let biggestDrop: StandingsRow | null = null;
  let worstDrop = 0;
  for (const row of overallRows) {
    if (row.movement !== null && row.movement < 0 && -row.movement > worstDrop) {
      worstDrop = -row.movement;
      biggestDrop = row;
    }
  }

  return {
    roundName,
    bestPlayer: best?.player?.firstName ?? null,
    bestPoints: best?.points ?? null,
    leader: leader?.player?.firstName ?? null,
    leaderPoints: leader?.points ?? null,
    exactScores,
    biggestDrop: biggestDrop?.player?.firstName ?? null,
    dropFrom: biggestDrop?.previousPosition ?? null,
    dropTo: biggestDrop?.position ?? null,
    worstMatch: null,
    worstMatchErrors: null,
  };
}
