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
import { resolveLeagueForSeason } from "@/lib/leagues/queries.ts";
import { loadStandingsData } from "@/lib/standings/queries";
import { computeStandings } from "@/lib/standings/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Le même calcul que l'écran Classement (pronostics + bonus + ajustements,
 * scopé aux seuls membres de CETTE ligue) — jamais un recompte à part qui
 * oublierait les ajustements ou mélangerait un compte hors ligue. Sans quoi
 * une notification « tu viens d'être doublé » pourrait se déclencher pour un
 * changement que le classement affiché ne montre même pas.
 */
async function takeStandingsSnapshot(
  sb: ReturnType<typeof createAdminClient>,
  seasonId: string,
  leagueId: string,
): Promise<{ snapshot: StandingsSnapshot[]; namesById: Map<string, string> }> {
  const data = await loadStandingsData(
    sb,
    { id: seasonId, label: "", competitionName: "", competitionLogoUrl: null },
    leagueId,
  );
  const table = computeStandings(data, { kind: "overall", scope: "live" });

  const namesById = new Map(data.players.map((p) => [p.userId, p.firstName]));
  const snapshot: StandingsSnapshot[] = table.rows.map((row) => ({
    userId: row.player.userId,
    points: row.points,
    position: row.position,
  }));

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
    // Simplification documentée (docs/05-ETAT.md) : une seule ligue par
    // compétition pour l'instant, comme à la clôture de journée.
    const leagueId = await resolveLeagueForSeason(sb, ctx.season.id);

    let snapshotBefore: StandingsSnapshot[] = [];
    let namesById = new Map<string, string>();
    if (leagueId) {
      try {
        const snap = await takeStandingsSnapshot(sb, ctx.season.id, leagueId);
        snapshotBefore = snap.snapshot;
        namesById = snap.namesById;
      } catch {
        // un classement illisible ne doit pas bloquer la synchro
      }
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

        if (snapshotBefore.length > 0 && leagueId) {
          try {
            const snapAfter = await takeStandingsSnapshot(sb, ctx.season.id, leagueId);
            await emitAndNotifyStandingsChanges(
              sb,
              ctx.season.id,
              leagueId,
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
