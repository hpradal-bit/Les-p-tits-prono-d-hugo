/**
 * Coquille de l'application connectée (chantier D).
 *
 * Tous les écrans de jeu vivent sous ce groupe de routes : ils héritent de la
 * navigation principale sans avoir à la connaître. La protection des routes
 * est assurée par le middleware (chantier A) et par RLS ; ici, on se contente
 * de savoir s'il faut afficher l'onglet Admin.
 */

import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "./_components/bottom-nav";

// L'application lit toujours des données propres au joueur connecté.
export const dynamic = "force-dynamic";

async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    const sb = await createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return false;

    const { data } = await sb
      .from("group_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .limit(1);
    return (data?.length ?? 0) > 0;
  } catch {
    // Session illisible ou base injoignable : on affiche la navigation du joueur.
    return false;
  }
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const isAdmin = await isCurrentUserAdmin();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      {/* pb-24 : la barre de navigation ne doit jamais masquer le contenu. */}
      <main className="flex-1 px-4 pb-28 pt-6 sm:px-6">{children}</main>
      <BottomNav isAdmin={isAdmin} />
    </div>
  );
}
