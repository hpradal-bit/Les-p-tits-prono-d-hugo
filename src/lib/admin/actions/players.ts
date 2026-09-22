"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Uuid } from "@/lib/types";
import { requireAdmin } from "../auth";
import { resolveLeagueForSeason } from "@/lib/leagues/queries.ts";
import { logAdminAction } from "../log";
import { adminFail, adminOk, type AdminActionState } from "../types";
import { loadActiveSeason } from "@/lib/standings/queries";
import { fieldErrorsOf, handle } from "./shared";

/**
 * Joueurs et ajustements de points — extrait de l'ancien `actions.ts` (audit
 * technique, tâche « Split admin/actions.ts »). Pur déplacement : aucun
 * comportement ni signature ne change, `../../actions.ts` réexporte tout.
 *
 * Un ajustement n'écrase jamais un score calculé : il vit dans sa propre
 * table, s'additionne au classement, et s'annule par un ajustement inverse
 * plutôt que par une suppression. L'histoire du groupe reste lisible.
 */

/** Un joueur ou un ajustement touche le classement et le vestiaire. */
function revalidatePathsAfterPlayer(): void {
  for (const path of ["/admin/joueurs", "/classement", "/vestiaire", "/profil"]) {
    revalidatePath(path);
  }
}

const playerStateSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.enum(["true", "false"]).transform((v) => v === "true"),
});

/**
 * Active ou désactive un joueur.
 *
 * Désactiver le sort du classement et des rappels, mais ne supprime rien :
 * ses pronostics et ses points restent en base, et le réactiver les rend.
 */
export async function setPlayerActive(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = playerStateSchema.safeParse({
      userId: formData.get("userId"),
      isActive: formData.get("isActive"),
    });
    if (!parsed.success) return adminFail("Joueur introuvable.");
    const { userId, isActive } = parsed.data;

    const admin = createAdminClient();
    const { data: before, error: bErr } = await admin
      .from("profiles").select("id, display_name, is_active").eq("id", userId).single();
    if (bErr) throw bErr;

    const { error: uErr } = await admin
      .from("profiles").update({ is_active: isActive }).eq("id", userId);
    if (uErr) throw uErr;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: isActive ? "player.reactivated" : "player.deactivated",
      entityType: "profile",
      entityId: userId,
      before: { is_active: before.is_active },
      after: { is_active: isActive },
      reason: isActive ? "Joueur réactivé depuis l'espace admin." : "Joueur désactivé depuis l'espace admin.",
    });

    revalidatePathsAfterPlayer();
    return adminOk(
      `${before.display_name} ${isActive ? "est de retour dans le classement" : "ne compte plus dans le classement"}.`,
    );
  } catch (error) {
    return handle(error);
  }
}

const playerRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "player"]),
});

/** Promeut ou rétrograde un joueur. Le dernier admin ne peut pas se démettre. */
export async function setPlayerRole(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = playerRoleSchema.safeParse({
      userId: formData.get("userId"),
      role: formData.get("role"),
    });
    if (!parsed.success) return adminFail("Rôle invalide.");
    const { userId, role } = parsed.data;

    const admin = createAdminClient();
    const { data: before, error: bErr } = await admin
      .from("group_members")
      .select("group_id, user_id, role")
      .eq("user_id", userId)
      .single();
    if (bErr) throw bErr;

    // Retirer le dernier administrateur fermerait l'espace admin pour tout le monde.
    if (before.role === "admin" && role === "player") {
      const { count, error: cErr } = await admin
        .from("group_members")
        .select("user_id", { count: "exact", head: true })
        .eq("group_id", before.group_id)
        .eq("role", "admin");
      if (cErr) throw cErr;
      if ((count ?? 0) <= 1) {
        return adminFail("Impossible : il n'y aurait plus aucun administrateur.");
      }
    }

    const { error: uErr } = await admin
      .from("group_members")
      .update({ role })
      .eq("group_id", before.group_id)
      .eq("user_id", userId);
    if (uErr) throw uErr;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "player.role_changed",
      entityType: "profile",
      entityId: userId,
      before: { role: before.role },
      after: { role },
      reason: `Rôle changé : ${role}.`,
    });

    revalidatePathsAfterPlayer();
    return adminOk(role === "admin" ? "Joueur promu administrateur." : "Joueur redevenu simple joueur.");
  } catch (error) {
    return handle(error);
  }
}

const adjustmentSchema = z.object({
  leagueId: z.string().uuid(),
  userId: z.string().uuid(),
  delta: z.coerce.number().int().min(-999).max(999),
  roundId: z.string(),
  // Optionnelle : l'admin n'a plus à se justifier pour agir, mais peut
  // toujours expliquer un ajustement de points aux autres joueurs s'il le
  // souhaite — c'est la seule action de l'espace admin où la raison est
  // directement montrée à quelqu'un d'autre que lui.
  reason: z.string().trim().max(500).optional(),
});

/**
 * Ajoute ou retire des points à la main — un pari perdu, un gage, une
 * correction. La raison, si elle est donnée, s'affiche telle quelle aux
 * joueurs ; à défaut, un libellé neutre la remplace.
 */
export async function adjustPoints(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = adjustmentSchema.safeParse({
      leagueId: formData.get("leagueId"),
      userId: formData.get("userId"),
      delta: formData.get("delta"),
      roundId: formData.get("roundId"),
      reason: formData.get("reason") || undefined,
    });
    if (!parsed.success) {
      return adminFail("Ajustement invalide.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { leagueId, userId, delta, roundId: rawRound } = parsed.data;
    // Deuxième vérification, par ligue (audit P0, point 2) : voir recordResult.
    await requireAdmin(leagueId);
    const reason = parsed.data.reason && parsed.data.reason.length > 0
      ? parsed.data.reason
      : "Ajustement manuel depuis l'espace admin.";
    if (delta === 0) return adminFail("Un ajustement de zéro point ne sert à rien.");

    const roundId = rawRound.trim() === "" ? null : rawRound;
    const admin = createAdminClient();
    const season = await loadActiveSeason(admin, leagueId);
    if (!season) return adminFail("Aucune saison pour cette ligue.");
    const seasonId = season.id;

    const { data: player, error: pErr } = await admin
      .from("profiles").select("display_name").eq("id", userId).single();
    if (pErr) throw pErr;

    const { data: inserted, error: iErr } = await admin
      .from("point_adjustments")
      .insert({
        user_id: userId,
        season_id: seasonId,
        round_id: roundId,
        delta,
        reason,
        source: "admin",
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (iErr) throw iErr;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "points.adjusted",
      entityType: "point_adjustment",
      entityId: inserted.id as Uuid,
      after: { delta, reason, players: player.display_name },
      reason,
      event: roundId ? { roundId } : undefined,
    });

    revalidatePathsAfterPlayer();
    return adminOk(
      `${delta > 0 ? "+" : ""}${delta} point${Math.abs(delta) > 1 ? "s" : ""} pour ${player.display_name}.`,
    );
  } catch (error) {
    return handle(error);
  }
}

const revertSchema = z.object({
  adjustmentId: z.string().uuid(),
});

/**
 * Annule un ajustement par un ajustement inverse.
 *
 * On n'efface pas la ligne d'origine : un joueur qui a vu ses points bouger
 * doit pouvoir retrouver pourquoi, même après correction.
 */
export async function revertAdjustment(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = revertSchema.safeParse({
      adjustmentId: formData.get("adjustmentId"),
    });
    if (!parsed.success) return adminFail("Ajustement introuvable.");
    const { adjustmentId } = parsed.data;

    const admin = createAdminClient();
    const { data: original, error: oErr } = await admin
      .from("point_adjustments")
      .select("id, user_id, season_id, round_id, delta, reason, source_id")
      .eq("id", adjustmentId)
      .single();
    if (oErr) throw oErr;

    if (original.source_id) {
      return adminFail("Cet ajustement en annule déjà un autre.");
    }

    // Deuxième vérification, par ligue (audit P0, point 2) : voir recordResult.
    await requireAdmin(
      (await resolveLeagueForSeason(admin, original.season_id as string)) ?? undefined,
    );

    const { error: iErr } = await admin.from("point_adjustments").insert({
      user_id: original.user_id,
      season_id: original.season_id,
      round_id: original.round_id,
      delta: -(original.delta as number),
      reason: `Annulation : ${original.reason}`,
      source: "admin",
      source_id: adjustmentId,
      created_by: ctx.userId,
    });
    if (iErr) throw iErr;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "points.adjustment_reverted",
      entityType: "point_adjustment",
      entityId: adjustmentId,
      before: { delta: original.delta, reason: original.reason },
      after: { delta: -(original.delta as number), reverts: adjustmentId },
      reason: "Ajustement annulé depuis l'espace admin.",
    });

    revalidatePathsAfterPlayer();
    return adminOk("Ajustement annulé.");
  } catch (error) {
    return handle(error);
  }
}
