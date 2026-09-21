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
import { loadLeaguesForCompetition } from "@/lib/leagues/queries.ts";
import { loadStandingsData } from "@/lib/standings/queries";
import { computeStandings } from "@/lib/standings/engine";
import { logger } from "@/lib/log";

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

    // Audit P0, point 3 : une compétition peut être jouée par plusieurs
    // ligues indépendantes (`leagues.competition_id` n'est pas unique,
    // migration 0033) — on prend donc un instantané AVANT/APRÈS et on
    // notifie pour CHAQUE ligue active de cette compétition, jamais
    // seulement la première créée (`resolveLeagueForSeason` ne convient
    // plus ici : il ne renvoie qu'une seule ligue arbitraire).
    const leagues = await loadLeaguesForCompetition(sb, ctx.season.competitionId);

    const snapshotsBefore = new Map<
      string,
      { snapshot: StandingsSnapshot[]; namesById: Map<string, string> }
    >();
    for (const league of leagues) {
      try {
        snapshotsBefore.set(
          league.leagueId,
          await takeStandingsSnapshot(sb, ctx.season.id, league.leagueId),
        );
      } catch (err) {
        // un classement illisible pour une ligue ne doit pas bloquer la
        // synchro, ni empêcher les autres ligues d'être notifiées.
        logger.error("sync.live.snapshot_before_failed", {
          leagueId: league.leagueId,
          seasonId: ctx.season.id,
          error: err,
        });
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

        for (const league of leagues) {
          const before = snapshotsBefore.get(league.leagueId);
          if (!before || before.snapshot.length === 0) continue;
          try {
            const after = await takeStandingsSnapshot(sb, ctx.season.id, league.leagueId);
            await emitAndNotifyStandingsChanges(
              sb,
              ctx.season.id,
              league.leagueId,
              before.snapshot,
              after.snapshot,
              before.namesById,
            );
          } catch (standingsErr) {
            logger.error("sync.live.standings_notifications_failed", {
              leagueId: league.leagueId,
              seasonId: ctx.season.id,
              error: standingsErr,
            });
          }
        }

        await flushDue(sb);
      } catch (error) {
        logger.error("sync.live.notifications_failed", {
          seasonId: ctx.season.id,
          error,
        });
      }
    }

    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("sync.live.failed", { message, error });
    return NextResponse.json({ error: message, status: "failed" }, { status: 500 });
  }
}
