import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings, setting } from "@/lib/settings";
import { getViewer } from "@/lib/auth/session";
import { renderEvent, RENDERED_KINDS, type FeedEvent, type RenderedEvent } from "./render";
import type { Uuid } from "@/lib/types";

export type FeedFilter = "tout" | "jeu" | "pouvoirs" | "messages";

const FILTER_KINDS: Record<FeedFilter, string[] | null> = {
  tout: null,
  jeu: ["exact_score", "leader_change", "overtake", "bad_streak", "fixture_finished", "round_locked", "round_settled", "auto_prediction", "badge_earned"],
  pouvoirs: ["power_declared", "power_resolved"],
  messages: [],
};

export interface FeedItem {
  id: Uuid;
  kind: string | null;
  createdAt: string;
  /** Publication automatique issue d'un événement, ou mot d'un joueur. */
  rendered: RenderedEvent | null;
  body: string | null;
  authorName: string | null;
  /** Pour afficher l'avatar de l'auteur — l'avatar apparaît partout où son nom apparaît. */
  authorFirstName: string | null;
  authorAvatarKind: "emoji" | "photo" | "club" | null;
  authorAvatarValue: string | null;
  reactions: { emoji: string; count: number; mine: boolean }[];
}

/**
 * Projette les événements non encore publiés vers le fil d'UNE ligue.
 *
 * Un message n'a par nature aucun lien avec une saison — impossible d'en
 * déduire la ligue. Les événements du jeu, eux, portent tous un `season_id` :
 * on ne projette dans le fil d'une ligue que ceux dont la saison relève de sa
 * compétition, pour ne jamais mélanger le récit de deux ligues indépendantes.
 *
 * L'index unique (league_id, event_id) rend l'opération idempotente : la
 * rejouer ne crée pas de doublon, même si deux joueurs ouvrent le Vestiaire
 * en même temps.
 */
async function projectEvents(leagueId: Uuid, competitionId: Uuid): Promise<void> {
  const admin = createAdminClient();

  const { data: events } = await admin
    .from("events")
    .select("id, seasons:season_id!inner(competition_id)")
    .in("kind", RENDERED_KINDS)
    .eq("seasons.competition_id", competitionId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!events || events.length === 0) return;

  const { data: existing } = await admin
    .from("feed_posts")
    .select("event_id")
    .eq("league_id", leagueId)
    .not("event_id", "is", null);

  const already = new Set((existing ?? []).map((p) => p.event_id as string));
  const missing = events.filter((e) => !already.has(e.id as string));
  if (missing.length === 0) return;

  await admin
    .from("feed_posts")
    .upsert(
      missing.map((e) => ({ league_id: leagueId, event_id: e.id as string })),
      { onConflict: "league_id,event_id", ignoreDuplicates: true },
    );
}

/** Le fil d'une ligue, du plus récent au plus ancien. */
export async function loadFeed(leagueId: Uuid, filter: FeedFilter = "tout"): Promise<FeedItem[]> {
  const viewer = await getViewer();
  if (!viewer) return [];

  const sb = await createClient();

  // La compétition de la ligue, pour ne projeter que ses propres événements.
  const { data: league } = await sb.from("leagues").select("competition_id").eq("id", leagueId).maybeSingle();
  if (!league) return [];

  await projectEvents(leagueId, league.competition_id);

  const settings = await loadSettings(sb);
  const pageSize = setting<number>(settings, "feed.page_size", 25);

  let query = sb
    .from("feed_posts")
    .select(`id, body, created_at, event_id,
             author:author_id (display_name, first_name, avatar_kind, avatar_value),
             event:event_id (id, kind, payload, created_at,
                             actor:actor_id (display_name),
                             target:target_id (display_name))`)
    .eq("league_id", leagueId)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(pageSize);

  if (filter === "messages") {
    query = query.is("event_id", null);
  }

  const { data: posts, error } = await query;
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

    const author = one<{
      display_name: string; first_name: string;
      avatar_kind: "emoji" | "photo" | "club"; avatar_value: string;
    }>(p.author);

    return {
      id: p.id as string,
      kind: raw?.kind ?? null,
      createdAt: (p.created_at as string),
      rendered,
      body: (p.body as string | null) ?? null,
      authorName: author?.display_name ?? null,
      authorFirstName: author?.first_name ?? null,
      authorAvatarKind: author?.avatar_kind ?? null,
      authorAvatarValue: author?.avatar_value ?? null,
      reactions: (byPost.get(p.id as string) ?? []).sort((a, b) => b.count - a.count),
    };
  }).filter((item) => {
    const allowed = FILTER_KINDS[filter];
    if (allowed === null) return true;
    if (allowed.length === 0) return item.kind === null;
    return item.kind !== null && allowed.includes(item.kind);
  });
}

/** La liste d'emojis proposée, lue en base — rien en dur. */
export async function loadReactionChoices(): Promise<string[]> {
  const sb = await createClient();
  const settings = await loadSettings(sb);
  return setting<string[]>(settings, "feed.reactions", ["😂", "❤️", "🔥", "👀", "🤡", "🏆"]);
}
