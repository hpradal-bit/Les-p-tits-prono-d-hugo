import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/session";

/**
 * La racine n'affiche rien : elle aiguille.
 *
 * Un joueur connecté veut voir ses pronostics de la journée, pas une page
 * d'accueil. Un visiteur non connecté n'a rien à faire ici.
 */
export default async function RootPage() {
  const viewer = await getViewer();
  redirect(viewer ? "/journee" : "/connexion");
}
