"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { recomputeFixtures, recomputeRound } from "@/lib/scoring/persist";
import { requireAdmin, AdminError } from "./auth";
import { logAdminAction, MissingReasonError } from "./log";
import { adminFail, adminOk, type AdminActionState } from "./types";

/**
 * Actions de l'espace admin.
 *
 * Deux règles tenues ici, sans exception :
 *   · aucune action n'écrit directement des points — elle corrige une donnée
 *     puis déclenche un recalcul ;
 *   · toute action écrit dans `admin_actions` avec une raison obligatoire.
 */

const resultSchema = z.object({
  fixtureId: z.string().uuid(),
  homeScore: z.coerce.number().int().min(0).max(200),
  awayScore: z.coerce.number().int().min(0).max(200),
  status: z.enum(["finished", "official"]),
  reason: z.string(),
});

/** Zod rend des tableaux éventuellement absents : on les rend exploitables. */
function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(error.flatten().fieldErrors).filter(
      (entry): entry is [string, string[]] => Array.isArray(entry[1]),
    ),
  );
}

function handle(error: unknown): AdminActionState {
  if (error instanceof MissingReasonError) {
    return adminFail("La raison est obligatoire.", { fieldErrors: { reason: [error.message] } });
  }
  if (error instanceof AdminError) return adminFail(error.message);
  console.error("[admin]", error);
  return adminFail("L'action a échoué. Réessaie dans un instant.");
}

/**
 * Saisie manuelle d'un résultat — le filet de sécurité du samedi soir.
 *
 * C'est ce qui rend l'application indépendante de toute API : sept scores à
 * taper prennent deux minutes, et les points tombent aussitôt.
 */
export async function recordResult(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = resultSchema.safeParse({
      fixtureId: formData.get("fixtureId"),
      homeScore: formData.get("homeScore"),
      awayScore: formData.get("awayScore"),
      status: formData.get("status"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return adminFail("Score invalide.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { fixtureId, homeScore, awayScore, status, reason } = parsed.data;
    const admin = createAdminClient();

    const { data: before, error: bErr } = await admin
      .from("fixtures")
      .select("id, round_id, home_score, away_score, status")
      .eq("id", fixtureId)
      .single();
    if (bErr) throw bErr;

    const { error: uErr } = await admin
      .from("fixtures")
      .update({
        home_score: homeScore,
        away_score: awayScore,
        status,
        data_source: "manual",
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", fixtureId);
    if (uErr) throw uErr;

    // Le résultat change : les points suivent, immédiatement et entièrement.
    const summary = await recomputeFixtures(admin, [fixtureId]);

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "fixture.result_recorded",
      entityType: "fixture",
      entityId: fixtureId,
      before: { home_score: before.home_score, away_score: before.away_score, status: before.status },
      after: { home_score: homeScore, away_score: awayScore, status },
      reason,
      event: { roundId: before.round_id, fixtureId },
    });

    revalidatePath("/admin/matchs");
    revalidatePath("/classement");
    revalidatePath(`/match/${fixtureId}`);

    return adminOk(
      summary.predictions === 0
        ? "Résultat enregistré. Aucun pronostic à scorer."
        : `Résultat enregistré. ${summary.predictions} pronostic${summary.predictions > 1 ? "s" : ""} recalculé${summary.predictions > 1 ? "s" : ""}, ${summary.points} point${summary.points > 1 ? "s" : ""} distribué${summary.points > 1 ? "s" : ""}${summary.exactScores > 0 ? `, ${summary.exactScores} score${summary.exactScores > 1 ? "s" : ""} exact${summary.exactScores > 1 ? "s" : ""} 👌` : ""}.`,
    );
  } catch (error) {
    return handle(error);
  }
}

const clearSchema = z.object({
  fixtureId: z.string().uuid(),
  reason: z.string(),
});

/** Annule un résultat saisi par erreur : les points reviennent en arrière. */
export async function clearResult(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = clearSchema.safeParse({
      fixtureId: formData.get("fixtureId"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) return adminFail("Match introuvable.");
    const { fixtureId, reason } = parsed.data;
    const admin = createAdminClient();

    const { data: before, error: bErr } = await admin
      .from("fixtures")
      .select("id, round_id, home_score, away_score, status")
      .eq("id", fixtureId).single();
    if (bErr) throw bErr;

    const { error: uErr } = await admin
      .from("fixtures")
      .update({ home_score: null, away_score: null, status: "scheduled" })
      .eq("id", fixtureId);
    if (uErr) throw uErr;

    const summary = await recomputeFixtures(admin, [fixtureId]);

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "fixture.status_forced",
      entityType: "fixture",
      entityId: fixtureId,
      before: { home_score: before.home_score, away_score: before.away_score, status: before.status },
      after: { home_score: null, away_score: null, status: "scheduled" },
      reason,
      event: { roundId: before.round_id, fixtureId },
    });

    revalidatePath("/admin/matchs");
    revalidatePath("/classement");
    return adminOk(`Résultat annulé. ${summary.cleared} ligne${summary.cleared > 1 ? "s" : ""} de points effacée${summary.cleared > 1 ? "s" : ""}.`);
  } catch (error) {
    return handle(error);
  }
}

const kickoffSchema = z.object({
  fixtureId: z.string().uuid(),
  kickoffAt: z.string().min(1),
  reason: z.string(),
});

/**
 * Changement d'horaire. Le verrouillage suit automatiquement : oublier ce
 * recalcul reviendrait à fermer les pronostics au mauvais moment.
 */
export async function changeKickoff(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = kickoffSchema.safeParse({
      fixtureId: formData.get("fixtureId"),
      kickoffAt: formData.get("kickoffAt"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) return adminFail("Horaire invalide.");
    const { fixtureId, kickoffAt, reason } = parsed.data;

    const kickoff = new Date(kickoffAt);
    if (Number.isNaN(kickoff.getTime())) {
      return adminFail("Horaire invalide.", { fieldErrors: { kickoffAt: ["Date illisible."] } });
    }

    const admin = createAdminClient();
    const { data: before, error: bErr } = await admin
      .from("fixtures").select("id, round_id, kickoff_at, locks_at").eq("id", fixtureId).single();
    if (bErr) throw bErr;

    const { data: setting } = await admin
      .from("app_settings").select("value").eq("key", "lock.minutes_before_kickoff").maybeSingle();
    const lockMinutes = Number(setting?.value ?? 120);
    const locksAt = new Date(kickoff.getTime() - lockMinutes * 60_000);

    const { error: uErr } = await admin
      .from("fixtures")
      .update({
        kickoff_at: kickoff.toISOString(),
        locks_at: locksAt.toISOString(),
        kickoff_confirmed: true,
      })
      .eq("id", fixtureId);
    if (uErr) throw uErr;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "fixture.kickoff_changed",
      entityType: "fixture",
      entityId: fixtureId,
      before: { kickoff_at: before.kickoff_at, locks_at: before.locks_at },
      after: { kickoff_at: kickoff.toISOString(), locks_at: locksAt.toISOString() },
      reason,
      event: { roundId: before.round_id, fixtureId },
    });

    revalidatePath("/admin/matchs");
    revalidatePath("/journee");
    return adminOk(`Horaire enregistré. Verrouillage recalculé à H-${lockMinutes} min.`);
  } catch (error) {
    return handle(error);
  }
}

const roundSchema = z.object({
  roundId: z.string().uuid(),
  reason: z.string(),
});

/** Relance le calcul de toute une journée. Idempotent : rejouable sans risque. */
export async function recomputeRoundAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = roundSchema.safeParse({
      roundId: formData.get("roundId"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) return adminFail("Journée introuvable.");
    const { roundId, reason } = parsed.data;

    const admin = createAdminClient();
    const summary = await recomputeRound(admin, roundId);

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "round.recomputed",
      entityType: "round",
      entityId: roundId,
      after: summary,
      reason,
      event: { roundId },
    });

    revalidatePath("/admin/matchs");
    revalidatePath("/classement");
    return adminOk(
      `${summary.fixtures} match${summary.fixtures > 1 ? "s" : ""} recalculé${summary.fixtures > 1 ? "s" : ""}, ${summary.predictions} pronostic${summary.predictions > 1 ? "s" : ""}, ${summary.points} point${summary.points > 1 ? "s" : ""}.`,
    );
  } catch (error) {
    return handle(error);
  }
}
