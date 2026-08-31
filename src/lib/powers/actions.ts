"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/log";
import { loadActiveSeason } from "@/lib/standings/queries";
import { getPower, requirePower } from "./registry.ts";
import {
  loadActivePowers,
  loadUserTokens,
  loadUserRoundUsage,
  loadRoundUsages,
} from "./queries.ts";
import { applyResolution } from "./resolve.ts";
import { creditCost, creditLabel, FALLBACK_CREDIT_COST } from "./credits.ts";
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
  const fallbackCost = setting<number>(settings, "powers.default_credit_cost", FALLBACK_CREDIT_COST);
  const cost = creditCost(power, fallbackCost);

  const tokens = await loadUserTokens(admin, user.id, seasonId);
  const availableTokens = tokens.filter((t) => t.status === "available");
  if (availableTokens.length < cost) {
    return {
      ok: false,
      message: `${power.name} coûte ${creditLabel(cost)}, il ne t'en reste que ${availableTokens.length}.`,
    };
  }
  const spentTokens = availableTokens.slice(0, cost);

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
    const { data: profiles } = await admin
      .from("profiles")
      .select("id")
      .eq("is_active", true);

    const profileIds = ((profiles ?? []) as Array<{ id: string }>).map((p) => p.id);

    let standings: { userId: string; position: number }[] = [];
    if (pk.needsTarget) {
      const { data: scores } = await admin
        .from("prediction_scores")
        .select("points, predictions!inner(user_id, fixture_id, fixtures!inner(round_id, rounds!inner(season_id)))")
        .order("points", { ascending: false });

      const totals = new Map<string, number>();
      for (const pid of profileIds) totals.set(pid, 0);

      for (const row of (scores ?? []) as Array<Record<string, unknown>>) {
        const pred = row.predictions as Record<string, unknown> | null;
        if (!pred) continue;
        const uid = pred.user_id as string;
        totals.set(uid, (totals.get(uid) ?? 0) + ((row.points as number) ?? 0));
      }

      standings = [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([userId], i) => ({ userId, position: i + 1 }));
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

  // Le coût est figé dans le snapshot : rééquilibrer un pouvoir plus tard ne doit
  // pas réécrire l'histoire d'une utilisation passée (§39 du cahier des charges).
  const snapshotBefore: Record<string, unknown> = { creditCost: cost };
  if (parsed.data.fixtureId) snapshotBefore.fixtureId = parsed.data.fixtureId;
  if (parsed.data.targetId) snapshotBefore.targetId = parsed.data.targetId;

  const spentIds = spentTokens.map((t) => t.id);

  // `eq("status", "available")` garde la réservation atomique : deux déclarations
  // concurrentes ne peuvent pas dépenser le même crédit.
  const { data: reserved, error: tokenErr } = await admin
    .from("tokens")
    .update({ status: "used", used_at: new Date().toISOString() })
    .in("id", spentIds)
    .eq("status", "available")
    .select("id");

  const reservedIds = ((reserved ?? []) as Array<{ id: string }>).map((t) => t.id);

  if (tokenErr || reservedIds.length < cost) {
    if (reservedIds.length > 0) {
      await admin.from("tokens").update({ status: "available", used_at: null }).in("id", reservedIds);
    }
    return { ok: false, message: "Tes crédits viennent de changer, réessaie." };
  }

  const { error: usageErr } = await admin.from("power_usages").insert({
    token_id: reservedIds[0],
    power_id: power.id,
    initiator_id: user.id,
    target_id: parsed.data.targetId ?? null,
    round_id: parsed.data.roundId,
    state: "declared",
    snapshot_before: snapshotBefore,
  });

  if (usageErr) {
    await admin.from("tokens").update({ status: "available", used_at: null }).in("id", reservedIds);
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
      credit_cost: cost,
    },
  });

  revalidatePath("/journee");
  revalidatePath("/classement");
  return {
    ok: true,
    message: `${power.emoji} ${power.name} activé — ${creditLabel(cost)} dépensés.`,
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

export async function grantTokens(
  input: unknown,
): Promise<AdminActionState> {
  const schema = z.object({
    leagueId: z.string().uuid(),
    period: z.enum(["first_half", "second_half", "full_season"]),
    count: z.number().int().min(1).max(50),
  });

  const ctx = await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Données invalides." };

  const admin = createAdminClient();
  const season = await loadActiveSeason(admin, parsed.data.leagueId);
  if (!season) return { status: "error", message: "Aucune saison pour cette ligue." };
  const seasonId = season.id;

  // Les membres de LA ligue concernée, pas tout le groupe : des crédits
  // distribués sur la Pro D2 ne doivent pas atterrir chez un joueur qui n'y
  // a jamais mis les pieds.
  const { data: members } = await admin
    .from("league_members")
    .select("user_id")
    .eq("league_id", parsed.data.leagueId);

  const rows = [];
  for (const m of (members ?? []) as Array<{ user_id: string }>) {
    for (let i = 0; i < parsed.data.count; i++) {
      rows.push({
        user_id: m.user_id,
        season_id: seasonId,
        period: parsed.data.period,
        status: "available",
      });
    }
  }

  const { error } = await admin.from("tokens").insert(rows);
  if (error) return { status: "error", message: error.message };

  const memberCount = (members ?? []).length;

  await logAdminAction(admin, {
    adminId: ctx.userId,
    action: "points.adjusted",
    entityType: "season",
    entityId: seasonId,
    reason: `${parsed.data.count} token(s) ${parsed.data.period} distribués à ${memberCount} joueur(s)`,
  });

  revalidatePath("/admin/pouvoirs");
  revalidatePath("/journee");
  return {
    status: "success",
    message: `${parsed.data.count * memberCount} token(s) distribués à ${memberCount} joueur(s).`,
  };
}

/**
 * Rééquilibrer un pouvoir depuis l'admin. Le coût vit dans `powers.config`, pas
 * dans le code : changer un prix ne doit jamais demander un redéploiement.
 * Les utilisations déjà déclarées gardent le coût figé dans leur snapshot.
 */
export async function setPowerCost(
  input: unknown,
): Promise<AdminActionState> {
  const schema = z.object({
    powerId: z.string().uuid(),
    cost: z.number().int().min(0).max(100),
  });

  const ctx = await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Coût invalide (0 à 100)." };

  const admin = createAdminClient();

  const { data: power } = await admin
    .from("powers")
    .select("id, name, config")
    .eq("id", parsed.data.powerId)
    .single();
  if (!power) return { status: "error", message: "Pouvoir introuvable." };

  const config = ((power.config as Record<string, unknown>) ?? {});
  const before = config.credit_cost ?? null;

  const { error } = await admin
    .from("powers")
    .update({ config: { ...config, credit_cost: parsed.data.cost } })
    .eq("id", parsed.data.powerId);
  if (error) return { status: "error", message: error.message };

  await logAdminAction(admin, {
    adminId: ctx.userId,
    action: "settings.updated",
    entityType: "app_setting",
    entityId: parsed.data.powerId,
    before: { credit_cost: before },
    after: { credit_cost: parsed.data.cost },
    reason: `Coût de ${power.name as string} : ${parsed.data.cost} crédit(s)`,
  });

  revalidatePath("/admin/pouvoirs");
  revalidatePath("/journee");
  return {
    status: "success",
    message: `${power.name as string} coûte désormais ${creditLabel(parsed.data.cost)}.`,
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
