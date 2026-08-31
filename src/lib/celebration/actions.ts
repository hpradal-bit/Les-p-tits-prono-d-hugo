"use server";

import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/session";
import { loadSettings, setting } from "@/lib/settings";
import { isCelebrationWindowOpen } from "./scenario";
import { loadPendingCelebration, type CelebrationPayload } from "./queries";

/**
 * Appelée par l'écran au chargement : y a-t-il une célébration à montrer ?
 * `null` la plupart du temps — c'est le cas normal, pas une erreur.
 */
export async function fetchPendingCelebration(leagueId: string): Promise<CelebrationPayload | null> {
  const viewer = await getViewer();
  if (!viewer) return null;

  const sb = await createClient();
  const settings = await loadSettings(sb);
  const timeZone = setting<string>(settings, "timezone", "Europe/Paris");
  if (!isCelebrationWindowOpen(new Date(), timeZone)) return null;

  return loadPendingCelebration(sb, leagueId, viewer.id);
}

/**
 * Marque la célébration vue — qu'elle se soit fermée toute seule ou que le
 * joueur l'ait fermée à la main. RLS (`celebration_views_own`) est la seule
 * vraie garde : ce client est celui du joueur, pas le service role.
 */
export async function markCelebrationSeen(leagueId: string, roundId: string): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) return;

  const sb = await createClient();
  await sb.from("celebration_views").upsert(
    { user_id: viewer.id, round_id: roundId, league_id: leagueId },
    { onConflict: "user_id,round_id,league_id" },
  );
}
