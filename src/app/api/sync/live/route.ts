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
import {
  emitAndNotifyStandingsChanges,
  type StandingsSnapshot,
} from "@/lib/push/standings";
import { flushDue } from "@/lib/push/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function takeStandingsSnapshot(
  sb: ReturnType<typeof createAdminClient>,
): Promise<{ snapshot: StandingsSnapshot[]; namesById: Map<string, string> }> {
  const [rawScoresRes, profilesRes] = await Promise.all([
    sb
      .from("prediction_scores")
      .select("predictions!inner(user_id), points"),
    sb.from("profiles").select("id, first_name").eq("is_active", true),
  ]);

  const namesById = new Map<string, string>();
  for (const p of (profilesRes.data ?? []) as Array<{ id: string; first_name: string }>) {
    namesById.set(p.id, p.first_name);
  }

  const pointsByUser = new Map<string, number>();
  for (const row of (rawScoresRes.data ?? []) as Array<{
    predictions: { user_id: string } | { user_id: string }[];
    points: number | null;
  }>) {
    const pred = Array.isArray(row.predictions) ? row.predictions[0] : row.predictions;
    if (!pred) continue;
    const uid = pred.user_id;
    pointsByUser.set(uid, (pointsByUser.get(uid) ?? 0) + (row.points ?? 0));
  }

  const snapshot: StandingsSnapshot[] = [...pointsByUser.entries()]
    .map(([userId, points]) => ({ userId, points, position: 0 }))
    .sort((a, b) => b.points - a.points);

  let pos = 0;
  let prevPoints = -Infinity;
  snapshot.forEach((row, idx) => {
    if (row.points !== prevPoints) pos = idx + 1;
    prevPoints = row.points;
    row.position = pos;
  });

  return { snapshot, namesById };
}

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

    let snapshotBefore: StandingsSnapshot[] = [];
    let namesById = new Map<string, string>();
    try {
      const snap = await takeStandingsSnapshot(sb);
      snapshotBefore = snap.snapshot;
      namesById = snap.namesById;
    } catch {
      // un classement illisible ne doit pas bloquer la synchro
    }

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

        if (snapshotBefore.length > 0) {
          try {
            const snapAfter = await takeStandingsSnapshot(sb);
            await emitAndNotifyStandingsChanges(
              sb,
              ctx.season.id,
              snapshotBefore,
              snapAfter.snapshot,
              namesById,
            );
          } catch (standingsErr) {
            console.error("[sync/live] standings notifications :", standingsErr);
          }
        }

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
