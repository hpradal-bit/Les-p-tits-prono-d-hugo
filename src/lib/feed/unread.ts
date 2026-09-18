/**
 * Les messages non lus du Vestiaire.
 *
 * La règle est personnelle : la pastille s'éteint quand *moi* j'ai ouvert le
 * fil, jamais quand un autre l'a ouvert. Chaque joueur a sa propre date de
 * dernier passage (`feed_reads`), et personne ne peut lire celle d'un autre —
 * RLS s'en charge, savoir quand un adversaire consulte le fil ne regarde
 * personne.
 *
 * Seuls les mots écrits par un joueur allument la pastille. Les publications
 * automatiques du jeu (un score exact, une journée close) sont du bruit de
 * fond : les compter reviendrait à laisser le point rouge allumé en
 * permanence pendant un week-end de Top 14.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Uuid } from "@/lib/types";

export interface UnreadCandidate {
  authorId: string | null;
  createdAt: string;
}

/**
 * Y a-t-il du neuf pour ce joueur ?
 *
 * `lastReadAt` à `null` = il n'a jamais ouvert le fil : tout mot d'un autre
 * compte. Ses propres messages ne comptent jamais.
 */
export function hasUnread(
  posts: readonly UnreadCandidate[],
  viewerId: string,
  lastReadAt: string | null,
): boolean {
  // Une date illisible vaut « jamais lu » : mieux vaut une pastille de trop
  // qu'un fil qui se tait. Comparer à un NaN aurait masqué TOUS les messages,
  // silencieusement.
  const parsed = lastReadAt ? new Date(lastReadAt).getTime() : NaN;
  const since = Number.isFinite(parsed) ? parsed : null;

  return posts.some((post) => {
    if (!post.authorId || post.authorId === viewerId) return false;
    if (since === null) return true;
    const at = new Date(post.createdAt).getTime();
    // Un message dont la date ne se lit pas est considéré comme nouveau.
    return !Number.isFinite(at) || at > since;
  });
}

/**
 * La même question, posée à la base, pour toutes les ligues du joueur.
 *
 * Une seule requête par côté : les dernières lectures d'un coup, les messages
 * d'un coup. Le nombre de requêtes ne dépend pas du nombre de ligues.
 */
export async function loadUnreadLeagues(
  sb: SupabaseClient,
  viewerId: Uuid,
  leagueIds: readonly Uuid[],
): Promise<Set<string>> {
  if (leagueIds.length === 0) return new Set();

  const [readsRes, postsRes] = await Promise.all([
    sb
      .from("feed_reads")
      .select("league_id, last_read_at")
      .eq("user_id", viewerId)
      .in("league_id", [...leagueIds]),
    sb
      .from("feed_posts")
      .select("league_id, author_id, created_at")
      .in("league_id", [...leagueIds])
      .eq("is_hidden", false)
      .not("author_id", "is", null)
      .neq("author_id", viewerId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const lastRead = new Map<string, string>();
  for (const r of (readsRes.data ?? []) as Array<{ league_id: string; last_read_at: string }>) {
    lastRead.set(r.league_id, r.last_read_at);
  }

  const byLeague = new Map<string, UnreadCandidate[]>();
  for (const p of (postsRes.data ?? []) as Array<{
    league_id: string;
    author_id: string | null;
    created_at: string;
  }>) {
    const list = byLeague.get(p.league_id) ?? [];
    list.push({ authorId: p.author_id, createdAt: p.created_at });
    byLeague.set(p.league_id, list);
  }

  const unread = new Set<string>();
  for (const leagueId of leagueIds) {
    const posts = byLeague.get(leagueId) ?? [];
    if (hasUnread(posts, viewerId, lastRead.get(leagueId) ?? null)) unread.add(leagueId);
  }
  return unread;
}

/** Marque le fil d'une ligue comme lu, à l'instant. */
export async function markFeedRead(
  sb: SupabaseClient,
  viewerId: Uuid,
  leagueId: Uuid,
): Promise<void> {
  await sb
    .from("feed_reads")
    .upsert(
      { user_id: viewerId, league_id: leagueId, last_read_at: new Date().toISOString() },
      { onConflict: "user_id,league_id" },
    );
}
