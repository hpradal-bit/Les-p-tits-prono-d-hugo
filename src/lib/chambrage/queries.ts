/**
 * Lecture de Chambrage. Serveur uniquement, toujours avec le client soumis à
 * RLS : `messages_read`/`message_reactions_read`/`message_reads_read` ne
 * renvoient déjà que ce qu'un membre de la ligue a le droit de voir.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Uuid } from "@/lib/types";
import { loadLeagueRoster } from "../standings/queries.ts";
import type { PlayerRef } from "../standings/engine.ts";
import type { RawMessage, RawReaction, RawRead } from "./model.ts";

const MESSAGE_COLUMNS =
  "id, sender_id, message_type, body, media_url, reply_to_id, created_at, updated_at, deleted_at";

function toMessage(row: Record<string, unknown>): RawMessage {
  return {
    id: row.id as string,
    senderId: (row.sender_id as string | null) ?? null,
    messageType: row.message_type as RawMessage["messageType"],
    body: (row.body as string | null) ?? null,
    mediaUrl: (row.media_url as string | null) ?? null,
    replyToId: (row.reply_to_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    deletedAt: (row.deleted_at as string | null) ?? null,
  };
}

export interface MessagesPage {
  messages: RawMessage[];
  /** Reste-t-il des messages plus anciens que le premier de cette page ? */
  hasMoreOlder: boolean;
}

/**
 * Une page de messages, du plus ancien au plus récent (l'ordre de lecture
 * d'une conversation). `before` charge l'historique : la page précédente,
 * strictement antérieure au message le plus ancien déjà affiché — c'est le
 * curseur du défilement infini vers le haut (§2.16).
 */
export async function loadMessagesPage(
  sb: SupabaseClient,
  leagueId: Uuid,
  options: { before?: string | null; limit?: number } = {},
): Promise<MessagesPage> {
  const limit = options.limit ?? 30;
  let query = sb
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (options.before) query = query.lt("created_at", options.before);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as Record<string, unknown>[];
  const hasMoreOlder = rows.length > limit;
  const page = hasMoreOlder ? rows.slice(0, limit) : rows;
  return { messages: page.map(toMessage).reverse(), hasMoreOlder };
}

export async function loadMessageById(sb: SupabaseClient, messageId: Uuid): Promise<RawMessage | null> {
  const { data, error } = await sb
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw error;
  return data ? toMessage(data as Record<string, unknown>) : null;
}

export async function loadReactionsFor(
  sb: SupabaseClient,
  messageIds: readonly string[],
): Promise<RawReaction[]> {
  if (messageIds.length === 0) return [];
  const { data, error } = await sb
    .from("message_reactions")
    .select("message_id, user_id, emoji")
    .in("message_id", messageIds);
  if (error) throw error;
  return ((data ?? []) as Array<{ message_id: string; user_id: string; emoji: string }>).map((r) => ({
    messageId: r.message_id,
    userId: r.user_id,
    emoji: r.emoji,
  }));
}

export async function loadReads(sb: SupabaseClient, leagueId: Uuid): Promise<RawRead[]> {
  const { data, error } = await sb
    .from("message_reads")
    .select("user_id, last_read_at")
    .eq("league_id", leagueId);
  if (error) throw error;
  return ((data ?? []) as Array<{ user_id: string; last_read_at: string }>).map((r) => ({
    userId: r.user_id,
    lastReadAt: r.last_read_at,
  }));
}

/** Ma propre dernière lecture de cette ligue — `null` si je n'ai jamais ouvert Chambrage. */
export async function loadMyLastRead(
  sb: SupabaseClient,
  leagueId: Uuid,
  viewerId: Uuid,
): Promise<string | null> {
  const { data } = await sb
    .from("message_reads")
    .select("last_read_at")
    .eq("league_id", leagueId)
    .eq("user_id", viewerId)
    .maybeSingle();
  return (data?.last_read_at as string | undefined) ?? null;
}

export interface ChambrageInitialData {
  messages: RawMessage[];
  hasMoreOlder: boolean;
  reactions: RawReaction[];
  reads: RawRead[];
  roster: PlayerRef[];
  lastReadAt: string | null;
}

/** Tout ce qu'il faut pour le premier rendu de Chambrage, en une passe. */
export async function loadChambrage(
  sb: SupabaseClient,
  leagueId: Uuid,
  viewerId: Uuid,
  pageSize = 30,
): Promise<ChambrageInitialData> {
  const { messages, hasMoreOlder } = await loadMessagesPage(sb, leagueId, { limit: pageSize });

  const [reactions, reads, roster, lastReadAt] = await Promise.all([
    loadReactionsFor(sb, messages.map((m) => m.id)),
    loadReads(sb, leagueId),
    loadLeagueRoster(sb, leagueId),
    loadMyLastRead(sb, leagueId, viewerId),
  ]);

  return { messages, hasMoreOlder, reactions, reads, roster, lastReadAt };
}
