"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/log";
import { loadSeasonById, loadStandingsData } from "@/lib/standings/queries";
import { buildProfiles } from "@/lib/stats/profile";
import { loadSettings, setting } from "@/lib/settings";
import { evaluateBadges, statsFromProfiles } from "./engine.ts";
import { loadActiveBadges, loadEarnedKeys } from "./queries.ts";
import type { AdminActionState } from "@/lib/admin/types";

/**
 * Attribution des badges à la clôture d'une journée.
 *
 * Même forme que la résolution des pouvoirs : on lit l'état, on laisse une
 * fonction pure décider, on écrit le résultat et on publie un événement pour
 * que le Vestiaire le raconte (règle 8 — le fil ne recalcule rien).
 *
 * Idempotent : les badges déjà obtenus sont écartés avant l'écriture, et la
 * contrainte `unique (user_id, badge_id, season_id)` ferme la porte derrière.
 * Rejouer la clôture d'une journée ne décerne donc rien deux fois.
 *
 * La portée est « officiel », comme le résumé de journée et l'instantané du
 * classement écrits au même moment : les trois doivent raconter la même chose.
 */
export async function awardRoundBadges(roundId: string): Promise<AdminActionState> {
  const ctx = await requireAdmin();
  const admin = createAdminClient();

  // La saison vient de la journée elle-même, jamais de « la » saison active :
  // plusieurs compétitions peuvent vivre en même temps (règle n° 5).
  const { data: round } = await admin
    .from("rounds")
    .select("season_id")
    .eq("id", roundId)
    .single();
  if (!round) return { status: "error", message: "Journée introuvable." };
  const seasonId = round.season_id as string;

  const season = await loadSeasonById(admin, seasonId);
  if (!season) return { status: "error", message: "Saison introuvable." };

  const [data, settings, badges, alreadyEarned] = await Promise.all([
    loadStandingsData(admin, season),
    loadSettings(admin),
    loadActiveBadges(admin),
    loadEarnedKeys(admin, seasonId),
  ]);

  if (badges.length === 0) {
    return { status: "success", message: "Aucun badge actif." };
  }

  const profiles = buildProfiles(data, {
    scope: "official",
    podiumSize: setting<number>(settings, "stats.podium_size", 3),
  });

  const stats = statsFromProfiles(profiles.values(), roundId);
  const { awards, skipped } = evaluateBadges({ badges, stats, alreadyEarned });

  if (awards.length === 0) {
    return {
      status: "success",
      message: "Aucun nouveau badge.",
      details: skipped.length > 0 ? [unimplemented(skipped)] : undefined,
    };
  }

  const byId = new Map(badges.map((b) => [b.id, b]));
  let written = 0;

  for (const award of awards) {
    const badge = byId.get(award.badgeId);
    if (!badge) continue;

    // Écriture une par une, et sans `upsert` : la contrainte d'unicité doit
    // pouvoir refuser un doublon sans emporter les autres badges de la fournée.
    const { error } = await admin.from("user_badges").insert({
      user_id: award.userId,
      badge_id: award.badgeId,
      season_id: seasonId,
      context: { ...award.context, round_id: roundId },
    });
    if (error) continue;

    written++;

    await admin.from("events").insert({
      kind: "badge_earned",
      season_id: seasonId,
      round_id: roundId,
      actor_id: award.userId,
      payload: {
        badge_code: badge.code,
        badge_name: badge.name,
        badge_emoji: badge.emoji,
        badge_description: badge.description,
        ...award.context,
      },
    });
  }

  if (written > 0) {
    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "round.settled",
      entityType: "round",
      entityId: roundId,
      reason: `${written} badge(s) décerné(s)`,
      after: { badges: awards.map((a) => a.badgeCode) },
      event: { seasonId, roundId },
    });
  }

  revalidatePath("/vestiaire");
  revalidatePath("/classement");
  revalidatePath("/profil");

  return {
    status: "success",
    message: `${written} badge(s) décerné(s).`,
    details: skipped.length > 0 ? [unimplemented(skipped)] : undefined,
  };
}

function unimplemented(codes: string[]): string {
  return `Sans implémentation, laissés de côté : ${codes.join(", ")}`;
}
