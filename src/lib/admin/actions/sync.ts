"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "../auth";
import { logAdminAction } from "../log";
import { adminFail, adminOk, type AdminActionState } from "../types";
import { createSyncContext, syncCalendar, syncLive, syncStandings } from "@/lib/providers";
import { handle } from "./shared";

/**
 * Synchronisation des données sportives — extrait de l'ancien `actions.ts`
 * (audit technique, tâche « Split admin/actions.ts »). Pur déplacement :
 * aucun comportement ni signature ne change, `../../actions.ts` réexporte
 * tout.
 *
 * Ces trois actions appellent le même code que le planificateur Cloudflare,
 * mais sans passer par HTTP : l'administrateur est déjà authentifié, il n'y a
 * donc ni secret à présenter ni route à exposer.
 *
 * Leur raison d'être n'est pas le confort. Le planificateur peut tomber un
 * samedi soir, un fournisseur peut changer un libellé en cours de saison :
 * sans ce bouton, la seule issue serait de saisir les scores à la main. Avec
 * lui, elle est de cliquer.
 */

const syncSchema = z.object({
  // Choisir la saison permet d'éprouver la chaîne sur une compétition qui
  // joue *maintenant*, sans attendre que le Top 14 commence. Absent, on
  // retombe sur la saison active.
  seasonId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
});

/** Ce que l'écran doit lire, quel que soit le type de synchronisation. */
function describeUnmatched(unmatched: string[]): string[] {
  if (unmatched.length === 0) return [];
  // Une équipe non rapprochée est la panne silencieuse par excellence : le
  // match existe, le score arrive, et rien ne se raccroche.
  return [
    `${unmatched.length} nom${unmatched.length > 1 ? "s" : ""} non rapproché${unmatched.length > 1 ? "s" : ""} : ${unmatched.join(", ")}`,
    "Ajoute un alias dans app_settings.sync.team_aliases pour chacun.",
  ];
}

async function runSync<T extends { status: string; provider: string; requestsUsed: number; warnings: string[]; error?: string }>(
  formData: FormData,
  action: "sync.calendar_run" | "sync.live_run" | "sync.standings_run",
  run: (ctx: Awaited<ReturnType<typeof createSyncContext>>) => Promise<T>,
  summarize: (report: T) => { message: string; details: string[] },
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = syncSchema.safeParse({
      seasonId: formData.get("seasonId") ?? undefined,
    });

    const admin = createAdminClient();
    const syncCtx = await createSyncContext(admin, {
      seasonId: parsed.success ? parsed.data.seasonId : undefined,
    });
    const report = await run(syncCtx);

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action,
      entityType: "season",
      entityId: syncCtx.season.id,
      before: null,
      after: report,
      reason: "Synchronisation lancée manuellement depuis l'espace admin.",
    });

    revalidatePath("/admin/synchronisation");
    revalidatePath("/admin/matchs");
    revalidatePath("/journee");
    revalidatePath("/classement");

    const { message, details } = summarize(report);
    const all = [...details, ...describeUnmatched((report as { unmatched?: string[] }).unmatched ?? []), ...report.warnings];

    // « failed » n'est pas une exception : la dernière donnée connue reste en
    // base, et c'est justement ce que le rapport doit dire.
    return report.status === "failed"
      ? adminFail(report.error ?? "La synchronisation a échoué.", { details: all })
      : adminOk(message, { details: all });
  } catch (error) {
    return handle(error);
  }
}

export async function runCalendarSync(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return runSync(formData, "sync.calendar_run", (ctx) => syncCalendar(ctx), (r) => ({
    message: `Calendrier synchronisé depuis ${r.provider} : ${r.fixturesReceived} match${r.fixturesReceived > 1 ? "s" : ""} reçu${r.fixturesReceived > 1 ? "s" : ""}.`,
    details: [
      // L'amorçage n'arrive qu'une fois par compétition, mais il mérite d'être
      // lu : les codes générés sont provisoires et méritent une relecture.
      ...(r.teamsCreated.length > 0
        ? [`${r.teamsCreated.length} équipes créées : ${r.teamsCreated.join(", ")}`]
        : []),
      `${r.fixturesCreated} créé${r.fixturesCreated > 1 ? "s" : ""}, ${r.fixturesUpdated} mis à jour, ${r.roundsCreated} journée${r.roundsCreated > 1 ? "s" : ""} créée${r.roundsCreated > 1 ? "s" : ""}.`,
      `${r.kickoffsConfirmed} horaire${r.kickoffsConfirmed > 1 ? "s" : ""} confirmé${r.kickoffsConfirmed > 1 ? "s" : ""} — seul un horaire confirmé fixe l'heure de verrouillage.`,
      `${r.requestsUsed} requête${r.requestsUsed > 1 ? "s" : ""} consommée${r.requestsUsed > 1 ? "s" : ""}.`,
      ...r.changes.slice(0, 12),
    ],
  }));
}

export async function runLiveSync(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  // `force` passe outre la fenêtre de match : c'est le mode « je veux voir
  // maintenant si ça marche », qui est précisément l'usage du bouton.
  return runSync(formData, "sync.live_run", (ctx) => syncLive(ctx, { force: true }), (r) => ({
    message: `Scores relevés depuis ${r.provider} : ${r.fixturesUpdated} match${r.fixturesUpdated > 1 ? "s" : ""} mis à jour.`,
    details: [
      r.inWindow ? "Une fenêtre de match est ouverte." : "Aucun match en cours — relevé forcé.",
      ...(r.finished.length > 0
        ? [
            `${r.finished.length} match${r.finished.length > 1 ? "s" : ""} terminé${r.finished.length > 1 ? "s" : ""}.`,
            // Le chiffre qui compte vraiment : un score écrit sans points
            // distribués laisserait le classement à zéro sans rien signaler.
            `${r.predictionsScored} pronostic${r.predictionsScored > 1 ? "s" : ""} noté${r.predictionsScored > 1 ? "s" : ""}.`,
          ]
        : []),
      `${r.requestsUsed} requête${r.requestsUsed > 1 ? "s" : ""} consommée${r.requestsUsed > 1 ? "s" : ""}.`,
      ...r.changes.slice(0, 12),
    ],
  }));
}

export async function runStandingsSync(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  return runSync(formData, "sync.standings_run", (ctx) => syncStandings(ctx), (r) => ({
    message: `Classement sportif rafraîchi depuis ${r.provider} : ${r.rowsWritten} ligne${r.rowsWritten > 1 ? "s" : ""} écrite${r.rowsWritten > 1 ? "s" : ""}.`,
    details: [
      `${r.rowsReceived} ligne${r.rowsReceived > 1 ? "s" : ""} reçue${r.rowsReceived > 1 ? "s" : ""}.`,
      `${r.requestsUsed} requête${r.requestsUsed > 1 ? "s" : ""} consommée${r.requestsUsed > 1 ? "s" : ""}.`,
    ],
  }));
}
