import { cache } from "react";
import { headers } from "next/headers";
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
 * l'appel : elle est mémorisée pour la durée du rendu (`react.cache`), et elle
 * ne revalide plus le jeton elle-même — le middleware l'a déjà fait pour
 * cette requête, une seule fois, et transmet l'identité vérifiée par un
 * en-tête. Sans ce partage, chaque écran payait son propre aller-retour
 * réseau vers Supabase Auth par-dessus celui du middleware — plusieurs
 * centaines de millisecondes perdues à chaque navigation, surtout sensible
 * sur mobile.
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

  // Le middleware a déjà revalidé le jeton auprès de Supabase pour cette
  // requête précise et transmet l'identité qui en ressort par un en-tête —
  // voir `src/middleware.ts`. On ne refait l'aller-retour nous-mêmes que si
  // cet en-tête est absent (chemin non couvert par le middleware), jamais
  // par défaut.
  const h = await headers();
  const headerUserId = h.get("x-viewer-id");

  let userId: string;
  let userEmail: string | null;

  if (headerUserId) {
    userId = headerUserId;
    const rawEmail = h.get("x-viewer-email");
    userEmail = rawEmail ? decodeURIComponent(rawEmail) : null;
  } else {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return null;
    userId = user.id;
    userEmail = user.email ?? null;
  }

  const [{ data: profile }, { data: membership }] = await Promise.all([
    sb
      .from("profiles")
      .select("id, first_name, display_name, avatar_kind, avatar_value, favourite_team_id, is_active")
      .eq("id", userId)
      .maybeSingle(),
    sb
      .from("group_members")
      .select("group_id, role")
      .eq("user_id", userId)
      .order("joined_at")
      .limit(1)
      .maybeSingle(),
  ]);

  // Compte authentifié mais sans profil ni appartenance : l'inscription s'est
  // interrompue en cours de route. On le traite comme non connecté.
  if (!profile || !membership) return null;

  return {
    id: profile.id,
    email: userEmail,
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
