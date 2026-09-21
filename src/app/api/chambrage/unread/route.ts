import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/session";
import { loadMyLeagues } from "@/lib/leagues/queries.ts";
import { loadChambrageUnreadCount } from "@/lib/chambrage/unread.ts";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * « Combien de messages ai-je manqués dans Chambrage ? »
 *
 * Interrogée par la barre de navigation pour le badge numérique. Vit dans une
 * route plutôt que dans la coquille de l'application : un layout partagé
 * n'est pas rechargé à chaque navigation, le badge resterait figé dans l'état
 * du premier chargement.
 *
 * Jamais mise en cache : c'est une réponse personnelle, et périmée elle ne
 * vaut rien.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ count: 0 }, { status: 401 });

  // Audit P3, point 10 : désormais surtout un filet de secours (le badge est
  // poussé par Supabase Realtime, voir bottom-nav.tsx) — la limite reste
  // large pour ne jamais gêner un usage légitime.
  const limited = rateLimit(`chambrage:unread:${viewer.id}`, { limit: 30, windowMs: 60_000 });
  if (!limited.ok) return rateLimitResponse(limited);

  const sb = await createClient();
  const leagues = await loadMyLeagues(sb, viewer.id);
  const count = await loadChambrageUnreadCount(
    sb,
    viewer.id,
    leagues.map((l) => l.leagueId),
  );

  return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
}
