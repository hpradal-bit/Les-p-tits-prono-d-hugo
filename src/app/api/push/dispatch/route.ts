import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { queueAll } from "@/lib/push/reminders";
import { flushDue } from "@/lib/push/notify";

/**
 * Appelé par le planificateur Cloudflare, protégé par le secret partagé.
 * Met en file ce qui est dû, puis envoie ce qui est prêt.
 */
export async function POST(request: Request) {
  const secret = process.env.SYNC_SECRET;
  const provided =
    request.headers.get("x-sync-secret") ??
    new URL(request.url).searchParams.get("secret");

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  }

  const admin = createAdminClient();
  try {
    const queued = await queueAll(admin);
    const sent = await flushDue(admin);
    return NextResponse.json({ ok: true, ...queued, sent });
  } catch (error) {
    console.error("[push/dispatch]", error);
    return NextResponse.json({ error: "Échec de l'envoi." }, { status: 500 });
  }
}
