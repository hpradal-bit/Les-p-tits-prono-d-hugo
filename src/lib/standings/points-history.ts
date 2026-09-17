/**
 * L'évolution des points, journée par journée — la matière du graphique.
 *
 * Calculée depuis les pronostics notés et les ajustements de pouvoirs, **pas**
 * depuis `standings_snapshots` : cette table ne se remplit qu'à la clôture
 * d'une journée, et aucune ne l'a jamais été. Un graphique adossé aux
 * instantanés resterait vide toute la saison.
 *
 * La partie calcul est pure et testable ; seule `loadPointsHistory` touche la
 * base.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Uuid } from "@/lib/types";

export interface RoundPoints {
  roundNumber: number;
  roundLabel: string;
  /** Points marqués par joueur sur cette seule journée. */
  byPlayer: Map<string, number>;
}

export interface PlayerLine {
  userId: string;
  firstName: string;
  /** Total cumulé après chaque journée. `null` avant sa première apparition. */
  cumulative: (number | null)[];
}

export interface PointsHistory {
  roundLabels: string[];
  players: PlayerLine[];
  /** Le plus haut total atteint, pour cadrer l'axe vertical. */
  maxPoints: number;
}

/**
 * Cumule les points journée après journée.
 *
 * Un joueur absent d'une journée garde son total : il ne redescend pas à zéro
 * et la courbe reste continue. Tant qu'il n'a jamais marqué, sa valeur est
 * `null` — on ne trace pas une ligne à plat pour quelqu'un qui n'a pas encore
 * joué.
 */
export function accumulate(
  rounds: RoundPoints[],
  players: Array<{ userId: string; firstName: string }>,
): PointsHistory {
  const ordered = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  const running = new Map<string, number>();
  const started = new Set<string>();

  const lines: PlayerLine[] = players.map((p) => ({
    userId: p.userId,
    firstName: p.firstName,
    cumulative: [],
  }));

  for (const round of ordered) {
    for (const line of lines) {
      const gained = round.byPlayer.get(line.userId);
      if (gained !== undefined) {
        running.set(line.userId, (running.get(line.userId) ?? 0) + gained);
        started.add(line.userId);
      }
      line.cumulative.push(started.has(line.userId) ? running.get(line.userId) ?? 0 : null);
    }
  }

  const maxPoints = lines.reduce((max, line) => {
    for (const v of line.cumulative) if (v !== null && v > max) max = v;
    return max;
  }, 0);

  return {
    roundLabels: ordered.map((r) => r.roundLabel),
    // Le meilleur en premier : la légende se lit comme le classement.
    players: lines.sort((a, b) => {
      const lastA = [...a.cumulative].reverse().find((v) => v !== null) ?? -1;
      const lastB = [...b.cumulative].reverse().find((v) => v !== null) ?? -1;
      return lastB - lastA || a.firstName.localeCompare(b.firstName);
    }),
    maxPoints,
  };
}

export async function loadPointsHistory(
  sb: SupabaseClient,
  seasonId: Uuid,
  leagueId: Uuid,
): Promise<PointsHistory> {
  const [roundsRes, membersRes] = await Promise.all([
    sb.from("rounds").select("id, number, name").eq("season_id", seasonId).order("number"),
    sb
      .from("league_members")
      .select("profiles!inner(id, first_name)")
      .eq("league_id", leagueId),
  ]);

  const rounds = (roundsRes.data ?? []) as Array<{ id: string; number: number; name: string }>;
  if (rounds.length === 0) return { roundLabels: [], players: [], maxPoints: 0 };

  const players: Array<{ userId: string; firstName: string }> = [];
  for (const row of (membersRes.data ?? []) as Array<Record<string, unknown>>) {
    const p = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as
      | { id: string; first_name: string }
      | undefined;
    if (p) players.push({ userId: p.id, firstName: p.first_name });
  }
  if (players.length === 0) return { roundLabels: [], players: [], maxPoints: 0 };

  const roundIds = rounds.map((r) => r.id);

  const [scoresRes, adjustmentsRes] = await Promise.all([
    sb
      .from("prediction_scores")
      .select("points, predictions!inner(user_id, fixtures!inner(round_id))")
      .in("predictions.fixtures.round_id", roundIds),
    sb
      .from("point_adjustments")
      .select("user_id, round_id, delta")
      .eq("season_id", seasonId),
  ]);

  const perRound = new Map<string, Map<string, number>>();
  const add = (roundId: string, userId: string, value: number) => {
    const bucket = perRound.get(roundId) ?? new Map<string, number>();
    bucket.set(userId, (bucket.get(userId) ?? 0) + value);
    perRound.set(roundId, bucket);
  };

  for (const row of (scoresRes.data ?? []) as Array<Record<string, unknown>>) {
    const pred = (Array.isArray(row.predictions) ? row.predictions[0] : row.predictions) as
      | { user_id: string; fixtures: { round_id: string } | { round_id: string }[] }
      | undefined;
    if (!pred) continue;
    const fixture = (Array.isArray(pred.fixtures) ? pred.fixtures[0] : pred.fixtures) as
      | { round_id: string }
      | undefined;
    if (!fixture) continue;
    add(fixture.round_id, pred.user_id, (row.points as number) ?? 0);
  }

  for (const row of (adjustmentsRes.data ?? []) as Array<{
    user_id: string;
    round_id: string | null;
    delta: number;
  }>) {
    if (!row.round_id) continue;
    add(row.round_id, row.user_id, row.delta);
  }

  // Seules les journées ayant réellement rapporté des points entrent dans le
  // graphique : une saison de 26 journées dont 2 jouées ne doit pas afficher
  // 24 colonnes vides.
  const played: RoundPoints[] = rounds
    .filter((r) => perRound.has(r.id))
    .map((r) => ({
      roundNumber: r.number,
      roundLabel: r.name,
      byPlayer: perRound.get(r.id) ?? new Map(),
    }));

  if (played.length === 0) return { roundLabels: [], players: [], maxPoints: 0 };
  return accumulate(played, players);
}
