import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings, setting } from "@/lib/settings";
import { getViewer } from "@/lib/auth/session";
import { renderEvent, RENDERED_KINDS, type FeedEvent, type RenderedEvent } from "./render";
import { isPowerPublic } from "@/lib/powers/visibility";
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

  const settings = await loadSettings(admin);
  // Assez large pour rattraper tout l'historique d'une saison à six joueurs.
  // Sans ça, les événements les plus anciens ne seraient jamais projetés : la
  // requête prend les N plus récents, et le reste tombe définitivement.
  const batch = setting<number>(settings, "feed.projection_batch", 1000);

  const { data: events, error: readError } = await admin
    .from("events")
    .select("id, kind, payload, round_id, seasons:season_id!inner(competition_id)")
    .in("kind", RENDERED_KINDS)
    .eq("seasons.competition_id", competitionId)
    .order("created_at", { ascending: false })
    .limit(batch);
  if (readError) throw readError;
  if (!events || events.length === 0) return;

  const { data: existing } = await admin
    .from("feed_posts")
    .select("event_id")
    .eq("league_id", leagueId)
    .not("event_id", "is", null);

  const already = new Set((existing ?? []).map((p) => p.event_id as string));
  const pending = events.filter((e) => !already.has(e.id as string));
  if (pending.length === 0) return;

  // Un pouvoir déclaré n'entre dans le fil qu'une fois son match commencé.
  // Le filtre est ici, à la projection, et pas à l'affichage : tant que la
  // publication n'existe pas, aucun client ne peut la lire, quoi qu'il
  // demande. Elle sera créée au prochain chargement du fil, après le coup
  // d'envoi.
  const missing = await withoutUnstartedPowers(admin, pending);
  if (missing.length === 0) return;

  // Insertion simple, pas d'`upsert` : l'index d'unicité est **partiel**
  // (`where event_id is not null`), et PostgreSQL refuse un `ON CONFLICT` sur un
  // index partiel quand la requête ne reprend pas son prédicat — ce que PostgREST
  // ne sait pas envoyer. L'`upsert` échouait donc à chaque passage, et l'erreur
  // n'était pas lue : aucun événement n'a jamais atteint le fil depuis le
  // cloisonnement par ligue.
  const { error } = await admin
    .from("feed_posts")
    .insert(missing.map((e) => ({ league_id: leagueId, event_id: e.id as string })));

  // 23505 = doublon : deux chargements simultanés du fil, sans conséquence.
  if (error && error.code !== "23505") throw error;
}

/**
 * Écarte les `power_declared` dont le match n'a pas encore commencé.
 *
 * Savoir qu'un joueur a posé un Sabotage sur un match avant que celui-ci se
 * joue renseignerait les autres au moment de pronostiquer : le fil deviendrait
 * un canal de renseignement. Les autres événements passent sans condition.
 */
async function withoutUnstartedPowers(
  admin: ReturnType<typeof createAdminClient>,
  events: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const powerEvents = events.filter((e) => e.kind === "power_declared");
  if (powerEvents.length === 0) return events;

  const fixtureIds = [
    ...new Set(
      powerEvents
        .map((e) => ((e.payload as Record<string, unknown> | null) ?? {}).fixture_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  // Un pouvoir qui ne vise pas un match (le Duel vise un joueur) se révèle au
  // premier coup d'envoi de sa journée : avant, il renseignerait tout autant.
  const roundIds = [
    ...new Set(
      powerEvents
        .map((e) => e.round_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const kickoffs = new Map<string, string>();
  const roundStarts = new Map<string, string>();
  const [byFixture, byRound] = await Promise.all([
    fixtureIds.length > 0
      ? admin.from("fixtures").select("id, kickoff_at").in("id", fixtureIds)
      : Promise.resolve({ data: [] }),
    roundIds.length > 0
      ? admin.from("fixtures").select("round_id, kickoff_at").in("round_id", roundIds)
      : Promise.resolve({ data: [] }),
  ]);
  for (const f of (byFixture.data ?? []) as Array<{ id: string; kickoff_at: string }>) {
    kickoffs.set(f.id, f.kickoff_at);
  }
  for (const f of (byRound.data ?? []) as Array<{ round_id: string; kickoff_at: string }>) {
    const current = roundStarts.get(f.round_id);
    if (!current || f.kickoff_at < current) roundStarts.set(f.round_id, f.kickoff_at);
  }

  const now = new Date();
  return events.filter((e) => {
    if (e.kind !== "power_declared") return true;
    const fixtureId = ((e.payload as Record<string, unknown> | null) ?? {}).fixture_id;
    const kickoff =
      typeof fixtureId === "string" && fixtureId !== ""
        ? kickoffs.get(fixtureId) ?? null
        : roundStarts.get(e.round_id as string) ?? null;
    return isPowerPublic(kickoff, now);
  });
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
             event:event_id (id, kind, payload, created_at, actor_id,
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

  // Les pouvoirs portent un identifiant de match dans leur issue, pas son nom.
  // On le résout ici, en une requête, pour que le fil puisse dire « sur
  // Toulouse - Bordeaux » plutôt qu'un UUID — y compris sur les événements
  // déjà enregistrés, dont le contenu ne sera jamais réécrit.
  const fixtureIds = new Set<string>();
  for (const p of posts ?? []) {
    const raw = one<{ payload: unknown }>(p.event);
    const payload = (raw?.payload ?? {}) as Record<string, unknown>;
    const outcome = (payload.outcome ?? {}) as Record<string, unknown>;
    const id = (outcome.fixtureId ?? payload.fixtureId) as string | undefined;
    if (typeof id === "string") fixtureIds.add(id);
  }

  const fixtureLabels = new Map<string, string>();
  if (fixtureIds.size > 0) {
    const { data: fx } = await sb
      .from("fixtures")
      .select("id, home:home_team_id (short_name), away:away_team_id (short_name)")
      .in("id", [...fixtureIds]);
    for (const f of fx ?? []) {
      const h = one<{ short_name: string }>(f.home)?.short_name;
      const a = one<{ short_name: string }>(f.away)?.short_name;
      if (h && a) fixtureLabels.set(f.id as string, `${h} - ${a}`);
    }
  }

  return (posts ?? []).map((p) => {
    const raw = one<{
      id: string; kind: string; payload: unknown; created_at: string;
      actor_id: string | null; actor: unknown; target: unknown;
    }>(p.event);

    let rendered: RenderedEvent | null = null;
    if (raw) {
      const payload = (raw.payload ?? {}) as Record<string, unknown>;
      const outcome = (payload.outcome ?? {}) as Record<string, unknown>;
      const fixtureId = (outcome.fixtureId ?? payload.fixtureId) as string | undefined;
      const winnerId = outcome.winnerId as string | undefined;

      const event: FeedEvent = {
        id: raw.id,
        kind: raw.kind,
        actorName: one<{ display_name: string }>(raw.actor)?.display_name ?? null,
        targetName: one<{ display_name: string }>(raw.target)?.display_name ?? null,
        payload,
        createdAt: raw.created_at,
        fixtureLabel: fixtureId ? fixtureLabels.get(fixtureId) ?? null : null,
        actorIsWinner: winnerId && raw.actor_id ? winnerId === raw.actor_id : null,
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
