import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Uuid } from "@/lib/types";

/**
 * Chantier A — lecture de la session côté serveur.
 *
 * `getViewer()` est le point d'entrée unique : elle répond à « qui regarde
 * l'écran, et avec quel rôle ». Le rôle vient de `group_members`, en base,
 * jamais du jeton client — un copain malin ne peut pas se déclarer admin.
 *
 * Les autres chantiers sont invités à s'en servir plutôt que de refaire
 * l'appel : elle est mémorisée pour la durée du rendu (`react.cache`).
 */

export type MemberRole = "player" | "admin";

export interface Viewer {
  id: Uuid;
  email: string | null;
  firstName: string;
  displayName: string;
  avatarKind: "emoji" | "photo" | "club";
  avatarValue: string;
  favouriteTeamId: Uuid | null;
  isActive: boolean;
  role: MemberRole;
  groupId: Uuid;
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const sb = await createClient();

  // `getUser()` et non `getSession()` : le jeton est revalidé auprès de
  // Supabase, on ne fait pas confiance au cookie sur parole.
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: membership }] = await Promise.all([
    sb
      .from("profiles")
      .select("id, first_name, display_name, avatar_kind, avatar_value, favourite_team_id, is_active")
      .eq("id", user.id)
      .maybeSingle(),
    sb
      .from("group_members")
      .select("group_id, role")
      .eq("user_id", user.id)
      .order("joined_at")
      .limit(1)
      .maybeSingle(),
  ]);

  // Compte authentifié mais sans profil ni appartenance : l'inscription s'est
  // interrompue en cours de route. On le traite comme non connecté.
  if (!profile || !membership) return null;

  return {
    id: profile.id,
    email: user.email ?? null,
    firstName: profile.first_name,
    displayName: profile.display_name,
    avatarKind: profile.avatar_kind,
    avatarValue: profile.avatar_value,
    favouriteTeamId: profile.favourite_team_id,
    isActive: profile.is_active,
    role: membership.role,
    groupId: membership.group_id,
  };
});

/** À utiliser en tête de tout écran privé. Redirige vers la connexion sinon. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/connexion");
  return viewer;
}

/** À utiliser en tête de l'espace admin, et à chaque action d'administration. */
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.role !== "admin") redirect("/");
  return viewer;
}
