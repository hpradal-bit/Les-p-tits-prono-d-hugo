import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Point d'atterrissage des liens envoyés par courriel — aujourd'hui, la
 * réinitialisation du mot de passe.
 *
 * Supabase utilise l'une ou l'autre forme selon la configuration du projet :
 *   · `?code=…`                  → flux PKCE, on échange le code contre une session ;
 *   · `?token_hash=…&type=…`     → lien à usage unique, on le vérifie.
 * On accepte les deux pour ne pas dépendre d'un réglage du tableau de bord.
 */

/** Ne suit qu'un chemin interne : jamais une URL absolue glissée dans le lien. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const sb = await createClient();

  if (code) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  } else if (tokenHash && type) {
    const { error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  // Lien expiré, déjà utilisé, ou tronqué par le client de messagerie.
  return NextResponse.redirect(new URL("/mot-de-passe-oublie?expire=1", origin));
}
