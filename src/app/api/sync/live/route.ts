/**
 * POST /api/sync/live — met à jour les scores en direct.
 *
 * Appelée toutes les 5 minutes par le Worker pendant une fenêtre de match, une
 * fois par heure le reste du temps. La route sait dire « rien à faire » sans
 * consommer la moindre requête chez un fournisseur, et renvoie `nextCheckAt` :
 * c'est ce champ que le planificateur met en cache.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSyncContext, syncLive } from "@/lib/providers";
import { checkSyncSecret, liveRequestSchema, readBody } from "@/lib/providers/sync/guard.ts";
import {
  queueFixtureResultNotifications,
  queueExactScoreNotifications,
  loadExactScoreNotifications,
} from "@/lib/push/results";
import { flushDue } from "@/lib/push/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = checkSyncSecret(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const body = await readBody(request, liveRequestSchema);
  if (!body.ok) return NextResponse.json({ error: body.message }, { status: 400 });

  try {
    const sb = createAdminClient();
    const ctx = await createSyncContext(sb, { seasonId: body.value.seasonId });
    const report = await syncLive(ctx, {
      date: body.value.date,
      force: body.value.force,
    });

    if (report.finishedDetails.length > 0) {
      try {
        await queueFixtureResultNotifications(sb, report.finishedDetails);
        const exactNotifs = await loadExactScoreNotifications(
          sb,
          report.finished,
          report.finishedDetails,
        );
        await queueExactScoreNotifications(sb, exactNotifs);
        await flushDue(sb);
      } catch (error) {
        console.error("[sync/live] notifications :", error);
      }
    }

    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync/live]", message);
    return NextResponse.json({ error: message, status: "failed" }, { status: 500 });
  }
}
