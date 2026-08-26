import { createClient } from "@/lib/supabase/server";
import { loadSettings, setting } from "@/lib/settings";
import { loadActiveSeason, loadStandingsData } from "@/lib/standings/queries";
import type { StandingsScope } from "@/lib/standings/engine";
import { buildProfiles, type PlayerProfile } from "./profile";
import type { Uuid } from "@/lib/types";

/**
 * Chargement des fiches joueurs, pour UNE ligue.
 *
 * Rien n'est recalculé ici de ce que le moteur de classement sait déjà faire :
 * on lui donne les mêmes données, il en tire les profils. Sans le filtre par
 * ligue, la fiche d'un joueur montrerait aussi ses adversaires d'une autre
 * ligue, avec qui il ne partage rien.
 */
export async function loadProfiles(
  leagueId: Uuid,
  scope: StandingsScope = "live",
): Promise<{ profiles: Map<Uuid, PlayerProfile>; seasonLabel: string } | null> {
  const sb = await createClient();
  const season = await loadActiveSeason(sb, leagueId);
  if (!season) return null;

  const [data, settings] = await Promise.all([
    loadStandingsData(sb, season, leagueId),
    loadSettings(sb),
  ]);

  const profiles = buildProfiles(data, {
    scope,
    podiumSize: setting<number>(settings, "stats.podium_size", 3),
  });

  return { profiles, seasonLabel: season.label };
}
