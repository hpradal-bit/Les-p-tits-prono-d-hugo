import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Révoque un abonnement. On marque plutôt que d'effacer : la trace sert au diagnostic. */

const schema = z.object({ endpoint: z.string().url() });

export async function POST(request: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête illisible." }, { status: 400 });

  const admin = createAdminClient();
  await admin
    .from("push_subscriptions")
    .update({ revoked_at: new Date().toISOString(), last_error: "retiré par le joueur" })
    .eq("endpoint", parsed.data.endpoint)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
