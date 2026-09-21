import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/session";
import { loadMyLeagues } from "@/lib/leagues/queries.ts";
import { loadUnreadLeagues } from "@/lib/feed/unread";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * « Ai-je des messages non lus ? »
 *
 * Interrogée par la barre de navigation. Elle vit dans une route plutôt que
 * dans la coquille de l'application parce qu'un layout partagé n'est PAS
 * rechargé à chaque navigation : la pastille serait restée figée dans l'état
 * du premier chargement, jusqu'au prochain rafraîchissement complet.
 *
 * Jamais mise en cache : c'est une réponse personnelle, et périmée elle ne
 * vaut rien.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ unread: false }, { status: 401 });

  // Audit P3, point 10 : voir /api/chambrage/unread.
  const limited = rateLimit(`feed:unread:${viewer.id}`, { limit: 30, windowMs: 60_000 });
  if (!limited.ok) return rateLimitResponse(limited);

  const sb = await createClient();
  const leagues = await loadMyLeagues(sb, viewer.id);
  const unread = await loadUnreadLeagues(
    sb,
    viewer.id,
    leagues.map((l) => l.leagueId),
  );

  return NextResponse.json(
    { unread: unread.size > 0, leagues: [...unread] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
