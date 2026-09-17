/**
 * L'historique des super-pouvoirs d'une ligue, groupé par journée.
 *
 * Lu depuis `power_usages` plutôt que depuis le fil d'événements : c'est la
 * table qui fait foi, et elle porte la journée, le match et l'issue — donc tout
 * ce qu'il faut pour grouper et filtrer sans recouper quoi que ce soit.
 *
 * Cloisonné par la compétition de la ligue : un pouvoir joué sur la compétition
 * de test ne doit jamais apparaître dans l'historique de la ligue des copains.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Uuid } from "@/lib/types";
import { powerVerdict, type PowerVerdict } from "./verdict.ts";

export interface PowerHistoryEntry {
  id: Uuid;
  playerId: Uuid;
  playerName: string;
  playerFirstName: string;
  avatarKind: "emoji" | "photo" | "club";
  avatarValue: string;
  powerName: string;
  powerEmoji: string;
  /** Adversaire visé, pour les pouvoirs qui en prennent un. */
  targetName: string | null;
  matchLabel: string | null;
  verdict: PowerVerdict;
  detail: string;
  delta: number | null;
  creditCost: number | null;
  createdAt: string;
}

export interface PowerHistoryRound {
  roundId: Uuid;
  roundNumber: number;
  roundName: string;
  entries: PowerHistoryEntry[];
}

export interface PowerHistoryPlayer {
  id: Uuid;
  name: string;
  /** Combien de pouvoirs ce joueur a déclarés — pour le montrer dans le filtre. */
  count: number;
}

export interface PowerHistory {
  rounds: PowerHistoryRound[];
  players: PowerHistoryPlayer[];
}

interface UsageRow {
  id: string;
  initiator_id: string;
  target_id: string | null;
  round_id: string;
  state: string;
  snapshot_before: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  created_at: string;
  powers: { code: string; name: string; emoji: string } | { code: string; name: string; emoji: string }[];
  rounds: { number: number; name: string; season_id: string } | { number: number; name: string; season_id: string }[];
}

const one = <T,>(v: unknown): T | undefined => (Array.isArray(v) ? v[0] : v) as T | undefined;

export async function loadPowerHistory(
  sb: SupabaseClient,
  leagueId: Uuid,
  options: { playerId?: Uuid | null } = {},
): Promise<PowerHistory> {
  // La compétition de la ligue borne tout le reste.
  const { data: league } = await sb
    .from("leagues")
    .select("competition_id")
    .eq("id", leagueId)
    .maybeSingle();
  if (!league) return { rounds: [], players: [] };

  const { data: seasons } = await sb
    .from("seasons")
    .select("id")
    .eq("competition_id", league.competition_id);
  const seasonIds = ((seasons ?? []) as Array<{ id: string }>).map((s) => s.id);
  if (seasonIds.length === 0) return { rounds: [], players: [] };

  const { data, error } = await sb
    .from("power_usages")
    .select(
      "id, initiator_id, target_id, round_id, state, snapshot_before, result, created_at, " +
        "powers!inner(code, name, emoji), rounds!inner(number, name, season_id)",
    )
    .in("rounds.season_id", seasonIds)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as UsageRow[];
  // Une déclaration annulée n'a jamais eu lieu : elle n'a pas sa place dans un
  // historique que les joueurs consultent pour se chambrer.
  const kept = rows.filter((r) => r.state !== "cancelled");
  if (kept.length === 0) return { rounds: [], players: [] };

  // Les noms : joueurs concernés et matchs cités, en deux requêtes.
  const profileIds = new Set<string>();
  const fixtureIds = new Set<string>();
  for (const r of kept) {
    profileIds.add(r.initiator_id);
    if (r.target_id) profileIds.add(r.target_id);
    const fixtureId = (r.snapshot_before?.fixtureId ?? null) as string | null;
    if (fixtureId) fixtureIds.add(fixtureId);
  }

  const [profilesRes, fixturesRes] = await Promise.all([
    sb
      .from("profiles")
      .select("id, display_name, first_name, avatar_kind, avatar_value")
      .in("id", [...profileIds]),
    fixtureIds.size > 0
      ? sb
          .from("fixtures")
          .select("id, home:home_team_id (short_name), away:away_team_id (short_name)")
          .in("id", [...fixtureIds])
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const profiles = new Map<string, {
    display_name: string;
    first_name: string;
    avatar_kind: "emoji" | "photo" | "club";
    avatar_value: string;
  }>();
  for (const p of (profilesRes.data ?? []) as Array<Record<string, unknown>>) {
    profiles.set(p.id as string, {
      display_name: p.display_name as string,
      first_name: p.first_name as string,
      avatar_kind: p.avatar_kind as "emoji" | "photo" | "club",
      avatar_value: p.avatar_value as string,
    });
  }

  const matches = new Map<string, string>();
  for (const f of (fixturesRes.data ?? []) as Array<Record<string, unknown>>) {
    const home = one<{ short_name: string }>(f.home)?.short_name;
    const away = one<{ short_name: string }>(f.away)?.short_name;
    if (home && away) matches.set(f.id as string, `${home} - ${away}`);
  }

  // Le décompte par joueur se fait avant le filtre : la liste déroulante doit
  // rester stable quand on sélectionne quelqu'un.
  const counts = new Map<string, number>();
  for (const r of kept) counts.set(r.initiator_id, (counts.get(r.initiator_id) ?? 0) + 1);

  const players: PowerHistoryPlayer[] = [...counts.entries()]
    .map(([id, count]) => ({ id, name: profiles.get(id)?.display_name ?? "Un joueur", count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const visible = options.playerId
    ? kept.filter((r) => r.initiator_id === options.playerId)
    : kept;

  const byRound = new Map<string, PowerHistoryRound>();

  for (const row of visible) {
    const power = one<{ code: string; name: string; emoji: string }>(row.powers);
    const round = one<{ number: number; name: string; season_id: string }>(row.rounds);
    if (!power || !round) continue;

    const target = row.target_id ? profiles.get(row.target_id) ?? null : null;
    const outcome = row.result;
    const winnerId = outcome?.winnerId as string | undefined;

    const { verdict, detail, delta } = powerVerdict(power.code, row.state, outcome, {
      actorIsWinner: winnerId ? winnerId === row.initiator_id : null,
      targetName: target?.display_name ?? null,
    });

    const initiator = profiles.get(row.initiator_id);
    const fixtureId = (row.snapshot_before?.fixtureId ?? null) as string | null;
    const cost = row.snapshot_before?.creditCost;

    const entry: PowerHistoryEntry = {
      id: row.id,
      playerId: row.initiator_id,
      playerName: initiator?.display_name ?? "Un joueur",
      playerFirstName: initiator?.first_name ?? "",
      avatarKind: initiator?.avatar_kind ?? "emoji",
      avatarValue: initiator?.avatar_value ?? "🏉",
      powerName: power.name,
      powerEmoji: power.emoji,
      targetName: target?.display_name ?? null,
      matchLabel: fixtureId ? matches.get(fixtureId) ?? null : null,
      verdict,
      detail,
      delta,
      creditCost: typeof cost === "number" ? cost : null,
      createdAt: row.created_at,
    };

    const existing = byRound.get(row.round_id);
    if (existing) {
      existing.entries.push(entry);
    } else {
      byRound.set(row.round_id, {
        roundId: row.round_id,
        roundNumber: round.number,
        roundName: round.name,
        entries: [entry],
      });
    }
  }

  // La journée la plus récente en premier : c'est celle dont on parle.
  const rounds = [...byRound.values()].sort((a, b) => b.roundNumber - a.roundNumber);
  return { rounds, players };
}
