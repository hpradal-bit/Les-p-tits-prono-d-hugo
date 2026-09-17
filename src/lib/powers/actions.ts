"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/log";
import { loadActiveSeason, loadStandingsData } from "@/lib/standings/queries";
import { computeStandings } from "@/lib/standings/engine";
import { resolveLeagueForSeason } from "@/lib/leagues/queries.ts";
import { getPower, requirePower } from "./registry.ts";
import {
  loadActivePowers,
  loadUsageCounts,
  loadUserRoundUsage,
  loadRoundUsages,
} from "./queries.ts";
import { applyResolution } from "./resolve.ts";
import { buildQuotas, quotaRefusal, FALLBACK_MAX_USES } from "./quota.ts";
import { loadSettings, setting } from "@/lib/settings";
import { isLockedAt } from "@/lib/predictions/lock";
import type { AdminActionState } from "@/lib/admin/types";

const declareSchema = z.object({
  powerCode: z.string().min(1),
  roundId: z.string().uuid(),
  targetId: z.string().uuid().nullable().optional(),
  fixtureId: z.string().uuid().nullable().optional(),
});

export async function declarePower(
  input: unknown,
): Promise<{ ok: boolean; message: string }> {
  const parsed = declareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Données invalides." };

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, message: "Session expirée." };

  const admin = createAdminClient();

  const powers = await loadActivePowers(admin);
  const power = powers.find((p) => p.code === parsed.data.powerCode);
  if (!power) return { ok: false, message: "Ce pouvoir n'est pas actif." };

  const pk = requirePower(power.code);

  const { data: round } = await admin
    .from("rounds")
    .select("id, status, season_id")
    .eq("id", parsed.data.roundId)
    .single();
  if (!round) return { ok: false, message: "Journée introuvable." };
  if (round.status === "settled") return { ok: false, message: "Cette journée est clôturée." };
  // La saison vient de la journée elle-même, jamais « la » saison courante :
  // plusieurs compétitions peuvent vivre en même temps (règle n° 5).
  const seasonId = round.season_id as string;

  const existing = await loadUserRoundUsage(admin, user.id, parsed.data.roundId);
  if (existing) return { ok: false, message: "Tu as déjà utilisé un pouvoir sur cette journée." };

  const settings = await loadSettings(admin);
  const fallbackMax = setting<number>(settings, "powers.max_uses_per_player", FALLBACK_MAX_USES);

  // Quota par pouvoir : plus de bourse commune, chaque pouvoir a son compteur.
  const counts = await loadUsageCounts(admin, user.id, seasonId);
  const quotas = buildQuotas(powers, counts, fallbackMax);
  const quota = quotas.find((q) => q.powerId === power.id);
  const refusal = quotaRefusal(quota, power.name);
  if (refusal) return { ok: false, message: refusal };

  // Un pouvoir ciblant un match ne peut plus être déclaré une fois ce match
  // verrouillé (ou déjà terminé) : au-delà, ce serait parier après coup — le
  // contraire d'un pronostic. Cf. rapport d'audit §14.
  let fixtureLocked: boolean | undefined;
  if (pk.needsFixture && parsed.data.fixtureId) {
    const { data: fixture } = await admin
      .from("fixtures")
      .select("locks_at, status")
      .eq("id", parsed.data.fixtureId)
      .single();
    if (!fixture) return { ok: false, message: "Match introuvable." };
    fixtureLocked =
      isLockedAt(fixture.locks_at as string) ||
      (fixture.status as string) !== "scheduled";
    if (fixtureLocked) {
      return { ok: false, message: "Ce match est déjà verrouillé ou terminé." };
    }
  }

  if (pk.needsTarget || pk.needsFixture) {
    let standings: { userId: string; position: number }[] = [];
    if (pk.needsTarget) {
      // Le classement général en direct de la ligue à laquelle appartient
      // cette journée — le même que celui affiché sur /classement, et
      // restreint aux membres de cette ligue (pas tous les profils actifs de
      // l'appli, sinon un joueur d'une autre ligue pourrait être visé).
      // Avant ce correctif, ce calcul sommait les points de TOUS les joueurs
      // actifs sur TOUTE l'histoire de l'application, toutes saisons et
      // compétitions confondues — un classement sans rapport avec le vrai,
      // qui pouvait laisser le joueur "premier" à tort et donc sans aucune
      // cible éligible pour le Duel.
      const leagueId = await resolveLeagueForSeason(sb, seasonId);
      if (leagueId) {
        const standingsData = await loadStandingsData(
          sb,
          { id: seasonId, label: "", competitionName: "", competitionLogoUrl: null },
          leagueId,
        );
        standings = computeStandings(standingsData, { kind: "overall", scope: "live" }).rows.map(
          (r) => ({ userId: r.player.userId, position: r.position }),
        );
      }
    }

    const validation = pk.validateDeclaration({
      initiatorId: user.id,
      targetId: parsed.data.targetId ?? null,
      fixtureId: parsed.data.fixtureId ?? null,
      fixtureLocked,
      power,
      standings,
    });
    if (!validation.valid) return { ok: false, message: validation.error ?? "Déclaration invalide." };
  }

  // Le rang d'utilisation est figé dans le snapshot : relever le plafond plus
  // tard ne doit pas réécrire l'histoire d'une utilisation passée.
  const snapshotBefore: Record<string, unknown> = {
    useIndex: (quota?.used ?? 0) + 1,
    maxUses: quota?.max ?? fallbackMax,
  };
  if (parsed.data.fixtureId) snapshotBefore.fixtureId = parsed.data.fixtureId;
  if (parsed.data.targetId) snapshotBefore.targetId = parsed.data.targetId;

  const { error: usageErr } = await admin.from("power_usages").insert({
    // Plus de jeton : c'est le nombre d'utilisations qui fait foi (quota).
    token_id: null,
    power_id: power.id,
    initiator_id: user.id,
    target_id: parsed.data.targetId ?? null,
    round_id: parsed.data.roundId,
    state: "declared",
    snapshot_before: snapshotBefore,
  });

  if (usageErr) {
    // Violation de l'index unique "une utilisation active par joueur et par
    // journée" (cf. migration) : deux clics simultanés ont tenté de déclarer
    // deux pouvoirs à la fois, la base n'en a laissé passer qu'un seul.
    if (usageErr.code === "23505") {
      return { ok: false, message: "Tu as déjà utilisé un pouvoir sur cette journée." };
    }
    return { ok: false, message: usageErr.message };
  }

  await admin.from("events").insert({
    kind: "power_declared",
    season_id: seasonId,
    round_id: parsed.data.roundId,
    actor_id: user.id,
    target_id: parsed.data.targetId ?? null,
    payload: {
      power_code: power.code,
      power_emoji: power.emoji,
      power_name: power.name,
      use_index: (quota?.used ?? 0) + 1,
      max_uses: quota?.max ?? fallbackMax,
    },
  });

  revalidatePath("/journee");
  revalidatePath("/classement");
  return {
    ok: true,
    message:
      `${power.emoji} ${power.name} activé !` +
      (quota ? ` Il t'en reste ${quota.remaining - 1} sur ${quota.max}.` : ""),
  };
}

export async function resolveRoundPowers(
  roundId: string,
): Promise<AdminActionState> {
  const ctx = await requireAdmin();
  const admin = createAdminClient();
  // La saison de la journée réglée, jamais « la » saison courante.
  const { data: round } = await admin
    .from("rounds")
    .select("season_id")
    .eq("id", roundId)
    .single();
  const seasonId = round?.season_id as string | undefined;
  if (!seasonId) return { status: "error", message: "Journée introuvable." };

  const usages = await loadRoundUsages(admin, roundId);
  const active = usages.filter((u) => u.state === "declared" || u.state === "accepted");

  if (active.length === 0) {
    return { status: "success", message: "Aucun pouvoir à résoudre." };
  }

  const powers = await loadActivePowers(admin);
  const powerMap = new Map(powers.map((p) => [p.id, p]));

  let resolved = 0;
  const skipped: string[] = [];

  for (const usage of active) {
    const power = powerMap.get(usage.powerId);
    if (!power) continue;

    // Un pouvoir présent en base mais sans implémentation ne doit pas faire
    // échouer la clôture entière : on le laisse en attente et on continue.
    const pk = getPower(power.code);
    if (!pk) {
      skipped.push(power.code);
      continue;
    }

    // Un pouvoir déjà résolu match par match (§ resolveFixturePowers) n'est
    // plus dans "declared"/"accepted" à ce stade : `active` ne peut donc pas
    // le contenir deux fois. Même logique de résolution, une seule écriture.
    await applyResolution(admin, seasonId, roundId, usage, power, ctx.userId);
    resolved++;
  }

  await logAdminAction(admin, {
    adminId: ctx.userId,
    action: "round.settled",
    entityType: "round",
    entityId: roundId,
    reason: `${resolved} pouvoir(s) résolu(s)`,
    event: { roundId },
  });

  revalidatePath("/journee");
  revalidatePath("/classement");
  return {
    status: "success",
    message: `${resolved} pouvoir(s) résolu(s).`,
    details:
      skipped.length > 0
        ? [`Sans implémentation, laissés en attente : ${skipped.join(", ")}`]
        : undefined,
  };
}

/**
 * Régler le nombre d'utilisations d'un pouvoir, depuis l'admin.
 *
 * Le plafond vit dans `powers.config`, pas dans le code : rééquilibrer le jeu
 * ne doit jamais demander un redéploiement. Les utilisations déjà déclarées
 * gardent leur rang fige dans leur snapshot — relever le plafond n'efface pas
 * l'histoire, il ouvre seulement la suite.
 */
export async function setPowerMaxUses(
  input: unknown,
): Promise<AdminActionState> {
  const schema = z.object({
    powerId: z.string().uuid(),
    maxUses: z.number().int().min(0).max(50),
  });

  const ctx = await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Nombre invalide (0 à 50)." };

  const admin = createAdminClient();

  const { data: power } = await admin
    .from("powers")
    .select("id, name, config")
    .eq("id", parsed.data.powerId)
    .single();
  if (!power) return { status: "error", message: "Pouvoir introuvable." };

  const config = ((power.config as Record<string, unknown>) ?? {});
  const before = config.max_uses_per_player ?? null;

  const { error } = await admin
    .from("powers")
    .update({ config: { ...config, max_uses_per_player: parsed.data.maxUses } })
    .eq("id", parsed.data.powerId);
  if (error) return { status: "error", message: error.message };

  await logAdminAction(admin, {
    adminId: ctx.userId,
    action: "settings.updated",
    entityType: "app_setting",
    entityId: parsed.data.powerId,
    before: { max_uses_per_player: before },
    after: { max_uses_per_player: parsed.data.maxUses },
    reason: `${power.name as string} : ${parsed.data.maxUses} utilisation(s) par joueur`,
  });

  revalidatePath("/admin/pouvoirs");
  revalidatePath("/journee");
  revalidatePath("/classement");
  return {
    status: "success",
    message:
      parsed.data.maxUses === 0
        ? `${power.name as string} est désormais désactivé.`
        : `${power.name as string} : ${parsed.data.maxUses} utilisation(s) par joueur.`,
  };
}

export async function togglePower(
  powerId: string,
  active: boolean,
): Promise<AdminActionState> {
  const ctx = await requireAdmin();
  const admin = createAdminClient();

  const { data: power } = await admin
    .from("powers")
    .select("id, code, name, is_active")
    .eq("id", powerId)
    .single();
  if (!power) return { status: "error", message: "Pouvoir introuvable." };

  await admin.from("powers").update({ is_active: active }).eq("id", powerId);

  await logAdminAction(admin, {
    adminId: ctx.userId,
    action: "settings.updated",
    entityType: "app_setting",
    entityId: powerId,
    before: { is_active: power.is_active },
    after: { is_active: active },
    reason: `${power.name as string} ${active ? "activé" : "désactivé"}`,
  });

  revalidatePath("/admin/pouvoirs");
  revalidatePath("/journee");
  return { status: "success", message: `${power.name as string} ${active ? "activé" : "désactivé"}.` };
}
