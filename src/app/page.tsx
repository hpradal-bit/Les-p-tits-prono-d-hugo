import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadMyLeagues } from "@/lib/leagues/queries.ts";

/**
 * La racine n'affiche rien : elle aiguille.
 *
 * Un joueur peut appartenir à plusieurs ligues indépendantes : sans ligue, il
 * n'y a rien à pronostiquer, direction l'accueil pour en rejoindre ou en créer
 * une. Avec une seule, on va droit au but — c'est le cas le plus courant,
 * inutile de lui imposer un choix qui n'en est pas un. Avec plusieurs, il doit
 * choisir : direction l'accueil, qui les liste toutes.
 */
export default async function RootPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/connexion");

  const sb = await createClient();
  const leagues = await loadMyLeagues(sb, viewer.id);

  // `/journee` ne connaît pas encore les ligues — seulement des codes de
  // compétition (`?ligue=top14|prod2`). Le pont tient tant qu'une compétition
  // n'a qu'une seule ligue, ce qui est le cas aujourd'hui ; il faudra que
  // `/journee` bascule sur `?league=<id>` le jour où deux ligues partagent une
  // même compétition (chantier déjà identifié, pas encore fait).
  if (leagues.length === 1) redirect(`/journee?ligue=${leagues[0].competitionCode}`);
  redirect("/accueil");
}
