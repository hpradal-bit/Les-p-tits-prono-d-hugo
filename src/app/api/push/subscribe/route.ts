import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/** Enregistre un abonnement push pour le joueur connecté. */

const schema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  }),
  previousEndpoint: z.string().url().nullable().optional(),
  userAgent: z.string().max(400).nullable().optional(),
});

export async function POST(request: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  // Audit P3, point 10 : borne la fréquence par joueur — un abonnement
  // change rarement, dix appels par minute couvrent largement un
  // renouvellement légitime tout en coupant une boucle pathologique.
  const limited = rateLimit(`push:subscribe:${user.id}`, { limit: 10, windowMs: 60_000 });
  if (!limited.ok) return rateLimitResponse(limited);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Abonnement illisible." }, { status: 400 });
  }

  const { subscription, previousEndpoint, userAgent } = parsed.data;
  const admin = createAdminClient();

  // Le navigateur a renouvelé son adresse : l'ancienne ne sert plus à rien.
  if (previousEndpoint && previousEndpoint !== subscription.endpoint) {
    await admin
      .from("push_subscriptions")
      .update({ revoked_at: new Date().toISOString(), last_error: "remplacé par le navigateur" })
      .eq("endpoint", previousEndpoint);
  }

  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      user_agent: userAgent ?? null,
      revoked_at: null,
      failure_count: 0,
      last_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
