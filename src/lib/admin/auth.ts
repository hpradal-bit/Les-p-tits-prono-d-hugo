import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setting, loadSettings } from "@/lib/settings";
import type { AdminContext } from "./types";

/**
 * Contrôle du rôle, côté serveur, à chaque fois.
 *
 * Le rôle vit dans `group_members`, jamais dans le jeton du navigateur : un
 * joueur qui bricole son stockage local ne devient pas administrateur. On lit
 * l'identité depuis `auth.getUser()`, qui vérifie le jeton auprès de Supabase,
 * puis le rôle en base avec la clé de service.
 */

/** Erreur d'autorisation : message directement affichable au joueur. */
export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminError";
  }
}

/**
 * Le contexte du visiteur : qui il est, dans quel groupe, et s'il administre.
 * Renvoie `null` s'il n'est pas connecté, pas membre, ou désactivé.
 */
export async function getViewerContext(): Promise<AdminContext | null> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const service = createAdminClient();

  const { data: profile } = await service
    .from("profiles")
    .select("id, display_name, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.is_active === false) return null;

  const { data: memberships } = await service
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });

  const list = memberships ?? [];
  if (list.length === 0) return null;

  const asAdmin = list.find((m) => m.role === "admin");
  const chosen = asAdmin ?? list[0];

  return {
    userId: profile.id,
    groupId: chosen.group_id,
    displayName: profile.display_name,
    isAdmin: Boolean(asAdmin),
  };
}

/**
 * Le contexte, à condition d'être administrateur.
 *
 * Historiquement, le rôle admin était global (`group_members`) : n'importe
 * quel administrateur pouvait agir sur n'importe quelle ligue. C'est une
 * escalade de privilèges horizontale dès qu'une deuxième ligue existe avec un
 * admin différent (audit technique, point 2, priorité P0).
 *
 * `leagueId`, quand il est fourni, ajoute une **deuxième** vérification, en
 * plus de la vérification globale existante (jamais à sa place, pour ne rien
 * casser du fonctionnement actuel — l'unique vrai groupe d'aujourd'hui est
 * déjà administrateur des deux ligues réelles, migration `0033_leagues.sql`) :
 * l'appelant doit aussi être `admin` dans `league_members` pour CETTE ligue
 * précise. Un admin de la ligue A qui n'est pas admin de la ligue B échoue
 * désormais cette deuxième vérification, même s'il reste admin « global ».
 *
 * Appeler `requireAdmin()` sans argument préserve exactement le comportement
 * d'avant (compatibilité ascendante) : c'est encore le bon choix pour les
 * actions qui ne portent sur aucune ligue précise (réglages globaux, gestion
 * des joueurs, synchronisation).
 */
export async function requireAdmin(leagueId?: string): Promise<AdminContext> {
  const ctx = await getViewerContext();
  if (!ctx) throw new AdminError("Connexion requise.");
  if (!ctx.isAdmin) throw new AdminError("Action réservée à l'administration.");

  if (leagueId) {
    const service = createAdminClient();
    const { data: membership } = await service
      .from("league_members")
      .select("role")
      .eq("league_id", leagueId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (!membership || membership.role !== "admin") {
      throw new AdminError("Action réservée à l'administration de cette ligue.");
    }
  }

  return ctx;
}

/**
 * Le journal d'administration est lisible par tous les joueurs quand le
 * réglage `admin_log.public` est vrai — c'est ce qui règle le problème
 * « l'admin joue aussi ». L'administrateur, lui, y accède toujours.
 */
export async function canReadJournal(ctx: AdminContext | null): Promise<boolean> {
  if (!ctx) return false;
  if (ctx.isAdmin) return true;
  const settings = await loadSettings(createAdminClient());
  return setting(settings, "admin_log.public", true) === true;
}
