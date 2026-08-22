import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Chantier A — rafraîchissement de session et protection des routes.
 *
 * Deux rôles, dans cet ordre :
 *
 *   1. **Rafraîchir la session.** Les jetons Supabase expirent au bout d'une
 *      heure. Un composant serveur ne peut pas poser de cookie ; c'est donc ici,
 *      et seulement ici, que le jeton est renouvelé et réécrit dans la réponse.
 *      Sans cela, l'application déconnecte les joueurs en pleine journée de
 *      Top 14.
 *
 *   2. **Fermer la porte.** Tout ce qui n'est pas explicitement public exige une
 *      session — l'espace de jeu comme `/admin`. Le rôle, lui, n'est jamais lu
 *      ici : il vit en base et se vérifie côté serveur à chaque action
 *      (`requireAdmin()`), jamais dans un jeton que le client pourrait tordre.
 */

/** Écrans accessibles sans session. */
const PUBLIC_ROUTES = [
  "/connexion",
  "/inscription",
  "/mot-de-passe-oublie",
  "/nouveau-mot-de-passe",
  "/callback",
];

/** Écrans qu'un joueur déjà connecté n'a plus rien à faire de voir. */
const GUEST_ONLY_ROUTES = ["/connexion", "/inscription", "/mot-de-passe-oublie"];

const isWithin = (pathname: string, routes: string[]) =>
  routes.some((r) => pathname === r || pathname.startsWith(`${r}/`));

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Sans configuration Supabase (construction, aperçu local), on laisse passer
  // plutôt que de casser toutes les pages avec une exception.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Ne pas retirer, ne pas déplacer : c'est cet appel qui renouvelle le jeton
  // et déclenche l'écriture des cookies ci-dessus.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Les routes d'API portent leur propre authentification (secret partagé pour
  // la synchronisation, session pour le push). On leur rend la session
  // rafraîchie, sans les rediriger : une API répond par un code, pas par une
  // page de connexion.
  if (pathname.startsWith("/api/")) return response;

  const isPublic = isWithin(pathname, PUBLIC_ROUTES);

  if (!user && !isPublic) {
    const target = request.nextUrl.clone();
    target.pathname = "/connexion";
    target.search = "";
    // On mémorise la destination pour y revenir après la connexion.
    if (pathname !== "/") target.searchParams.set("suite", pathname);
    return NextResponse.redirect(target);
  }

  if (user && isWithin(pathname, GUEST_ONLY_ROUTES)) {
    const target = request.nextUrl.clone();
    const suite = searchParams.get("suite");
    // Uniquement un chemin interne : jamais une URL absolue fournie par autrui.
    target.pathname = suite && suite.startsWith("/") && !suite.startsWith("//") ? suite : "/";
    target.search = "";
    return NextResponse.redirect(target);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Tout, sauf ce qui ne porte jamais de session :
     * fichiers internes de Next, favicon, manifeste, service worker, logos
     * et images statiques.
     */
    "/((?!_next/static|_next/image|favicon.ico|logos/|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
