/**
 * Le compteur de messages non lus de Chambrage — le badge numérique de la
 * barre de navigation (« Chambrage 🔴 3 »), distinct du fil de jeu.
 *
 * Personnel comme la lecture elle-même : `message_reads` ne porte que la
 * dernière visite de chacun, RLS n'expose jamais celle d'un autre.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Uuid } from "@/lib/types";
import { unreadCount } from "./model.ts";

/**
 * Le nombre total de messages non lus, toutes ligues confondues — une seule
 * requête par côté (lectures, messages), le nombre de requêtes ne dépend pas
 * du nombre de ligues du joueur.
 */
export async function loadChambrageUnreadCount(
  sb: SupabaseClient,
  viewerId: Uuid,
  leagueIds: readonly Uuid[],
): Promise<number> {
  if (leagueIds.length === 0) return 0;

  const [readsRes, messagesRes] = await Promise.all([
    sb
      .from("message_reads")
      .select("league_id, last_read_at")
      .eq("user_id", viewerId)
      .in("league_id", [...leagueIds]),
    sb
      .from("messages")
      .select("league_id, sender_id, created_at")
      .in("league_id", [...leagueIds])
      .is("deleted_at", null)
      .neq("sender_id", viewerId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const lastRead = new Map<string, string>();
  for (const r of (readsRes.data ?? []) as Array<{ league_id: string; last_read_at: string }>) {
    lastRead.set(r.league_id, r.last_read_at);
  }

  const byLeague = new Map<string, Array<{ senderId: string | null; createdAt: string }>>();
  for (const m of (messagesRes.data ?? []) as Array<{
    league_id: string;
    sender_id: string | null;
    created_at: string;
  }>) {
    const list = byLeague.get(m.league_id) ?? [];
    list.push({ senderId: m.sender_id, createdAt: m.created_at });
    byLeague.set(m.league_id, list);
  }

  let total = 0;
  for (const leagueId of leagueIds) {
    const messages = byLeague.get(leagueId) ?? [];
    total += unreadCount(messages, viewerId, lastRead.get(leagueId) ?? null);
  }
  return total;
}
