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

/** Le contexte, à condition d'être administrateur. Lève sinon. */
export async function requireAdmin(): Promise<AdminContext> {
  const ctx = await getViewerContext();
  if (!ctx) throw new AdminError("Connexion requise.");
  if (!ctx.isAdmin) throw new AdminError("Action réservée à l'administration.");
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
