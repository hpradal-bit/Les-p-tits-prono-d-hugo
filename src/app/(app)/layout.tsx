/**
 * Coquille de l'application connectée (chantier D).
 *
 * Tous les écrans de jeu vivent sous ce groupe de routes : ils héritent de la
 * navigation principale sans avoir à la connaître. La protection des routes
 * est assurée par le middleware (chantier A) et par RLS ; ici, on se contente
 * de savoir s'il faut afficher l'onglet Admin.
 */

import type { ReactNode } from "react";
import { getViewer } from "@/lib/auth/session";
import { ServiceWorkerRegistrar } from "./_components/service-worker";
import { BottomNav } from "./_components/bottom-nav";

// L'application lit toujours des données propres au joueur connecté.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // `getViewer()` est mémorisée pour la requête (`react.cache`) : la page
  // rendue à l'intérieur de ce layout l'appelle de toute façon, donc cet appel
  // ne coûte ni revalidation Supabase ni requête supplémentaire — juste une
  // lecture d'un résultat déjà en main. Avant, cette fonction refaisait sa
  // propre vérification de session ET sa propre requête `group_members` sur
  // CHAQUE écran de l'application, en plus de tout ce que la page en dessous
  // demandait déjà.
  const viewer = await getViewer();
  const isAdmin = viewer?.role === "admin";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      {/* pb-24 : la barre de navigation ne doit jamais masquer le contenu. */}
      <main className="flex-1 px-4 pb-28 pt-6 sm:px-6">{children}</main>
      <ServiceWorkerRegistrar />
      <BottomNav isAdmin={isAdmin} />
    </div>
  );
}
