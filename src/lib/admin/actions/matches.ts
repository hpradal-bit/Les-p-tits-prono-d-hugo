"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyDefaultPredictionsForRound } from "@/lib/predictions/round-lock";
import { recomputeFixtures, recomputeRound } from "@/lib/scoring/persist";
import type { Uuid } from "@/lib/types";
import { requireAdmin } from "../auth";
import { resolveLeagueForRound } from "@/lib/leagues/queries.ts";
import { logAdminAction } from "../log";
import { adminFail, adminOk, type AdminActionState } from "../types";
import { fieldErrorsOf, handle } from "./shared";

/**
 * Matchs, résultats et journées — extrait de l'ancien `actions.ts` (audit
 * technique, tâche « Split admin/actions.ts »). Pur déplacement : aucun
 * comportement ni signature ne change, `../../actions.ts` réexporte tout.
 *
 * Deux règles tenues ici, sans exception :
 *   · aucune action n'écrit directement des points — elle corrige une donnée
 *     puis déclenche un recalcul ;
 *   · toute action écrit dans `admin_actions` avec une raison.
 */

const resultSchema = z.object({
  fixtureId: z.string().uuid(),
  // Chaîne plutôt que nombre : un champ vide doit rester distinguable de zéro,
  // pour pouvoir effacer un score saisi par erreur sans taper 0-0 (qui est un
  // vrai résultat de match nul, pas une absence de résultat).
  homeScore: z.string().trim(),
  awayScore: z.string().trim(),
  status: z.enum(["finished", "official"]),
});

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
    });
    if (!parsed.success) {
      return adminFail("Score invalide.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { fixtureId, homeScore: rawHome, awayScore: rawAway, status } = parsed.data;
    const homeEmpty = rawHome === "";
    const awayEmpty = rawAway === "";
    if (homeEmpty !== awayEmpty) {
      return adminFail("Renseigne les deux scores, ou laisse les deux vides pour effacer le résultat.");
    }

    const admin = createAdminClient();

    if (homeEmpty && awayEmpty) {
      return clearFixtureResult(admin, ctx, fixtureId);
    }

    const homeScore = Number(rawHome);
    const awayScore = Number(rawAway);
    const scoreValid = (n: number) => Number.isInteger(n) && n >= 0 && n <= 200;
    if (!scoreValid(homeScore) || !scoreValid(awayScore)) {
      return adminFail("Score invalide.", {
        fieldErrors: {
          homeScore: scoreValid(homeScore) ? [] : ["Entier entre 0 et 200."],
          awayScore: scoreValid(awayScore) ? [] : ["Entier entre 0 et 200."],
        },
      });
    }

    const { data: before, error: bErr } = await admin
      .from("fixtures")
      .select("id, round_id, home_score, away_score, status")
      .eq("id", fixtureId)
      .single();
    if (bErr) throw bErr;

    // Deuxième vérification, par ligue cette fois (audit P0, point 2) : un
    // admin de la ligue A ne doit pas pouvoir saisir le résultat d'un match
    // d'une ligue B dont il n'est pas administrateur.
    await requireAdmin(await resolveLeagueForRound(admin, before.round_id as string) ?? undefined);

    const { error: uErr } = await admin
      .from("fixtures")
      .update({
        home_score: homeScore,
        away_score: awayScore,
        status,
        data_source: "manual",
        last_synced_at: new Date().toISOString(),
        // Sans ça, l'horodatage « dernière mise à jour » resterait celui de la
        // dernière écriture de la synchro et mentirait aux joueurs.
        updated_at: new Date().toISOString(),
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
      reason: `Résultat saisi : ${homeScore}-${awayScore} (${status === "official" ? "officiel" : "terminé"}).`,
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
});

/**
 * Efface un résultat saisi par erreur — score et statut repartent à zéro,
 * les points suivent. Partagé par le formulaire de résultat (scores laissés
 * vides) et par le bouton « Annuler le résultat ».
 */
async function clearFixtureResult(
  admin: SupabaseClient,
  ctx: { userId: Uuid },
  fixtureId: Uuid,
): Promise<AdminActionState> {
  const { data: before, error: bErr } = await admin
    .from("fixtures")
    .select("id, round_id, home_score, away_score, status")
    .eq("id", fixtureId).single();
  if (bErr) throw bErr;

  // Deuxième vérification, par ligue (audit P0, point 2) : voir recordResult.
  await requireAdmin(await resolveLeagueForRound(admin, before.round_id as string) ?? undefined);

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
    reason: "Résultat effacé depuis l'espace admin.",
    event: { roundId: before.round_id, fixtureId },
  });

  revalidatePath("/admin/matchs");
  revalidatePath("/classement");
  return adminOk(`Résultat effacé. ${summary.cleared} ligne${summary.cleared > 1 ? "s" : ""} de points effacée${summary.cleared > 1 ? "s" : ""}.`);
}

/** Annule un résultat saisi par erreur : les points reviennent en arrière. */
export async function clearResult(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = clearSchema.safeParse({
      fixtureId: formData.get("fixtureId"),
    });
    if (!parsed.success) return adminFail("Match introuvable.");
    const admin = createAdminClient();
    return await clearFixtureResult(admin, ctx, parsed.data.fixtureId);
  } catch (error) {
    return handle(error);
  }
}

const kickoffSchema = z.object({
  fixtureId: z.string().uuid(),
  kickoffAt: z.string().min(1),
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
    });
    if (!parsed.success) return adminFail("Horaire invalide.");
    const { fixtureId, kickoffAt } = parsed.data;

    const kickoff = new Date(kickoffAt);
    if (Number.isNaN(kickoff.getTime())) {
      return adminFail("Horaire invalide.", { fieldErrors: { kickoffAt: ["Date illisible."] } });
    }

    const admin = createAdminClient();
    const { data: before, error: bErr } = await admin
      .from("fixtures").select("id, round_id, kickoff_at, locks_at").eq("id", fixtureId).single();
    if (bErr) throw bErr;

    // Deuxième vérification, par ligue (audit P0, point 2) : voir recordResult.
    await requireAdmin(await resolveLeagueForRound(admin, before.round_id as string) ?? undefined);

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
      reason: "Horaire modifié depuis l'espace admin.",
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
});

/**
 * Pose les pronostics par défaut sur une journée déjà verrouillée.
 *
 * C'est le filet si le planificateur n'a pas tourné. Rejouable : relancée deux
 * fois, l'opération ne crée rien de plus, elle ne peut donc pas doubler les
 * pronostics d'un joueur.
 */
export async function applyRoundDefaultsAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = roundSchema.safeParse({
      roundId: formData.get("roundId"),
    });
    if (!parsed.success) return adminFail("Journée introuvable.");
    const { roundId } = parsed.data;

    const admin = createAdminClient();
    // Deuxième vérification, par ligue (audit P0, point 2) : voir recordResult.
    await requireAdmin(await resolveLeagueForRound(admin, roundId) ?? undefined);
    const report = await applyDefaultPredictionsForRound(admin, roundId);

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "round.defaults_applied",
      entityType: "round",
      entityId: roundId,
      after: { ...report },
      reason: "Pronostics par défaut appliqués manuellement depuis l'espace admin.",
      event: { roundId },
    });

    revalidatePath("/admin/matchs");
    revalidatePath("/classement");

    if (!report.defaultPredictionEnabled) {
      return adminFail("Le barème n'autorise pas le pronostic par défaut.");
    }
    if (report.lockedFixtures === 0) {
      return adminOk("Aucun match verrouillé sur cette journée : rien à poser.");
    }
    return adminOk(
      `${report.created} pronostic${report.created > 1 ? "s" : ""} par défaut posé${report.created > 1 ? "s" : ""} sur ${report.lockedFixtures} match${report.lockedFixtures > 1 ? "s" : ""}.`,
    );
  } catch (error) {
    return adminFail(error instanceof Error ? error.message : "Échec.");
  }
}

/**
 * Clôture une journée : recalcul, résolution des pouvoirs, résumé, snapshot.
 *
 * Étape terminale du cycle de vie d'une journée : après ça, plus rien ne
 * bouge — les points sont définitifs et le résumé est publié au Vestiaire.
 */
export async function settleRoundAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const { settleRound } = await import("../settle");
    const roundId = formData.get("roundId");
    if (typeof roundId !== "string" || roundId.length === 0) {
      return adminFail("Journée introuvable.");
    }
    return await settleRound(roundId);
  } catch (error) {
    return handle(error);
  }
}

/** Relance le calcul de toute une journée. Idempotent : rejouable sans risque. */
export async function recomputeRoundAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = roundSchema.safeParse({
      roundId: formData.get("roundId"),
    });
    if (!parsed.success) return adminFail("Journée introuvable.");
    const { roundId } = parsed.data;

    const admin = createAdminClient();
    // Deuxième vérification, par ligue (audit P0, point 2) : voir recordResult.
    await requireAdmin(await resolveLeagueForRound(admin, roundId) ?? undefined);
    const summary = await recomputeRound(admin, roundId);

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "round.recomputed",
      entityType: "round",
      entityId: roundId,
      after: summary,
      reason: "Recalcul manuel de la journée depuis l'espace admin.",
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
