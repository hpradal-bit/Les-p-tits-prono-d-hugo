/**
 * POST /api/sync/standings — met à jour le classement réel du championnat.
 *
 * Un appel par jour suffit : le classement ne bouge qu'après les matchs.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSyncContext, syncStandings } from "@/lib/providers";
import { checkSyncSecret, readBody, standingsRequestSchema } from "@/lib/providers/sync/guard.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = checkSyncSecret(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const body = await readBody(request, standingsRequestSchema);
  if (!body.ok) return NextResponse.json({ error: body.message }, { status: 400 });

  try {
    const sb = createAdminClient();
    const ctx = await createSyncContext(sb, { seasonId: body.value.seasonId });
    const report = await syncStandings(ctx);
    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync/standings]", message);
    return NextResponse.json({ error: message, status: "failed" }, { status: 500 });
  }
}
