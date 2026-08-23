/**
 * POST /api/sync/calendar — confirme les horaires et importe les matchs.
 *
 * Déclenchée une fois par jour par le Worker Cloudflare, et à la demande depuis
 * l'espace admin. Protégée par le secret partagé `SYNC_SECRET`.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSyncContext, syncCalendar } from "@/lib/providers";
import { calendarRequestSchema, checkSyncSecret, readBody } from "@/lib/providers/sync/guard.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = checkSyncSecret(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const body = await readBody(request, calendarRequestSchema);
  if (!body.ok) return NextResponse.json({ error: body.message }, { status: 400 });

  try {
    const sb = createAdminClient();
    const ctx = await createSyncContext(sb, { seasonId: body.value.seasonId });
    const report = await syncCalendar(ctx, {
      range: body.value.from && body.value.to
        ? { from: body.value.from, to: body.value.to }
        : undefined,
      dryRun: body.value.dryRun,
    });

    // Une panne de fournisseur n'est pas une panne de l'application : 200, et
    // le rapport dit ce qui s'est passé. Le Worker ne doit pas relancer en
    // boucle sur un 500.
    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync/calendar]", message);
    return NextResponse.json({ error: message, status: "failed" }, { status: 500 });
  }
}
