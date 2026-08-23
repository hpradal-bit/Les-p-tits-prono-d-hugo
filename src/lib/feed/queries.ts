import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings, setting } from "@/lib/settings";
import { getViewer } from "@/lib/auth/session";
import { renderEvent, RENDERED_KINDS, type FeedEvent, type RenderedEvent } from "./render";
import type { Uuid } from "@/lib/types";

export interface FeedItem {
  id: Uuid;
  createdAt: string;
  /** Publication automatique issue d'un événement, ou mot d'un joueur. */
  rendered: RenderedEvent | null;
  body: string | null;
  authorName: string | null;
  reactions: { emoji: string; count: number; mine: boolean }[];
}

/**
 * Projette les événements non encore publiés vers le fil.
 *
 * L'index unique (group_id, event_id) rend l'opération idempotente : la
 * rejouer ne crée pas de doublon, même si deux joueurs ouvrent le Vestiaire
 * en même temps.
 */
async function projectEvents(groupId: Uuid): Promise<void> {
  const admin = createAdminClient();

  const { data: events } = await admin
    .from("events")
    .select("id")
    .in("kind", RENDERED_KINDS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!events || events.length === 0) return;

  const { data: existing } = await admin
    .from("feed_posts")
    .select("event_id")
    .eq("group_id", groupId)
    .not("event_id", "is", null);

  const already = new Set((existing ?? []).map((p) => p.event_id as string));
  const missing = events.filter((e) => !already.has(e.id as string));
  if (missing.length === 0) return;

  await admin
    .from("feed_posts")
    .upsert(
      missing.map((e) => ({ group_id: groupId, event_id: e.id as string })),
      { onConflict: "group_id,event_id", ignoreDuplicates: true },
    );
}

/** Le fil du groupe, du plus récent au plus ancien. */
export async function loadFeed(): Promise<FeedItem[]> {
  const viewer = await getViewer();
  if (!viewer) return [];

  await projectEvents(viewer.groupId);

  const sb = await createClient();
  const settings = await loadSettings(sb);
  const pageSize = setting<number>(settings, "feed.page_size", 25);

  const { data: posts, error } = await sb
    .from("feed_posts")
    .select(`id, body, created_at, event_id,
             author:author_id (display_name),
             event:event_id (id, kind, payload, created_at,
                             actor:actor_id (display_name),
                             target:target_id (display_name))`)
    .eq("group_id", viewer.groupId)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(pageSize);
  if (error) throw error;

  const ids = (posts ?? []).map((p) => p.id as string);
  const byPost = new Map<string, { emoji: string; count: number; mine: boolean }[]>();

  if (ids.length > 0) {
    const { data: reactions } = await sb
      .from("reactions").select("post_id, user_id, emoji").in("post_id", ids);
    for (const r of reactions ?? []) {
      const list = byPost.get(r.post_id as string) ?? [];
      const found = list.find((x) => x.emoji === r.emoji);
      if (found) {
        found.count += 1;
        found.mine ||= r.user_id === viewer.id;
      } else {
        list.push({ emoji: r.emoji as string, count: 1, mine: r.user_id === viewer.id });
      }
      byPost.set(r.post_id as string, list);
    }
  }

  const one = <T,>(v: unknown): T | null => (Array.isArray(v) ? v[0] : v) as T | null;

  return (posts ?? []).map((p) => {
    const raw = one<{
      id: string; kind: string; payload: unknown; created_at: string;
      actor: unknown; target: unknown;
    }>(p.event);

    let rendered: RenderedEvent | null = null;
    if (raw) {
      const event: FeedEvent = {
        id: raw.id,
        kind: raw.kind,
        actorName: one<{ display_name: string }>(raw.actor)?.display_name ?? null,
        targetName: one<{ display_name: string }>(raw.target)?.display_name ?? null,
        payload: (raw.payload ?? {}) as Record<string, unknown>,
        createdAt: raw.created_at,
      };
      rendered = renderEvent(event);
    }

    return {
      id: p.id as string,
      createdAt: (p.created_at as string),
      rendered,
      body: (p.body as string | null) ?? null,
      authorName: one<{ display_name: string }>(p.author)?.display_name ?? null,
      reactions: (byPost.get(p.id as string) ?? []).sort((a, b) => b.count - a.count),
    };
  });
}

/** La liste d'emojis proposée, lue en base — rien en dur. */
export async function loadReactionChoices(): Promise<string[]> {
  const sb = await createClient();
  const settings = await loadSettings(sb);
  return setting<string[]>(settings, "feed.reactions", ["😂", "❤️", "🔥", "👀", "🤡", "🏆"]);
}
