import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Uuid } from "../types.ts";

/**
 * Contrôle du rôle, propre à une ligue — jamais à confondre avec
 * `src/lib/admin/auth.ts` (l'administration globale, celle d'Hugo, qui gère
 * l'infrastructure partagée : calendrier, barème, résultats de match).
 * `LeagueContext` désigne l'administration d'UNE ligue précise : ses membres,
 * son nom, sa clé. Les deux rôles ne se substituent jamais l'un à l'autre.
 */

export class LeagueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeagueError";
  }
}

export interface LeagueContext {
  userId: Uuid;
  leagueId: Uuid;
  isLeagueAdmin: boolean;
}

/** Le contexte du visiteur pour CETTE ligue. Lève s'il n'en est pas membre. */
export async function requireLeagueMember(leagueId: Uuid): Promise<LeagueContext> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new LeagueError("Connexion requise.");

  const service = createAdminClient();
  const { data: membership } = await service
    .from("league_members")
    .select("role")
    .eq("league_id", leagueId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) throw new LeagueError("Tu n'es pas membre de cette ligue.");

  return { userId: user.id, leagueId, isLeagueAdmin: membership.role === "admin" };
}

/** Comme `requireLeagueMember`, mais exige en plus le rôle d'administrateur de la ligue. */
export async function requireLeagueAdmin(leagueId: Uuid): Promise<LeagueContext> {
  const ctx = await requireLeagueMember(leagueId);
  if (!ctx.isLeagueAdmin) {
    throw new LeagueError("Action réservée à l'administration de cette ligue.");
  }
  return ctx;
}
