"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { logAdminAction } from "@/lib/admin/log";
import { currentSeasonId } from "@/lib/admin/queries";
import { requirePower } from "./registry.ts";
import {
  loadActivePowers,
  loadUserTokens,
  loadUserRoundUsage,
  loadRoundUsages,
  loadFixtureScoresForRound,
  loadRoundTotals,
} from "./queries.ts";
import type { AdminActionState } from "@/lib/admin/types";
import type { ResolveContext } from "./types.ts";

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
  const seasonId = await currentSeasonId(admin);

  const powers = await loadActivePowers(admin);
  const power = powers.find((p) => p.code === parsed.data.powerCode);
  if (!power) return { ok: false, message: "Ce pouvoir n'est pas actif." };

  const pk = requirePower(power.code);

  const { data: round } = await admin
    .from("rounds")
    .select("id, status")
    .eq("id", parsed.data.roundId)
    .single();
  if (!round) return { ok: false, message: "Journée introuvable." };
  if (round.status === "settled") return { ok: false, message: "Cette journée est clôturée." };

  const existing = await loadUserRoundUsage(admin, user.id, parsed.data.roundId);
  if (existing) return { ok: false, message: "Tu as déjà utilisé un pouvoir sur cette journée." };

  const tokens = await loadUserTokens(admin, user.id, seasonId);
  const availableToken = tokens.find((t) => t.status === "available");
  if (!availableToken) return { ok: false, message: "Tu n'as plus de token disponible." };

  if (pk.needsTarget || pk.needsFixture) {
    const { data: standingsRows } = await admin
      .from("point_adjustments")
      .select("user_id")
      .eq("season_id", seasonId);

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
      power,
      standings,
    });
    if (!validation.valid) return { ok: false, message: validation.error ?? "Déclaration invalide." };
  }

  const snapshotBefore: Record<string, unknown> = {};
  if (parsed.data.fixtureId) snapshotBefore.fixtureId = parsed.data.fixtureId;
  if (parsed.data.targetId) snapshotBefore.targetId = parsed.data.targetId;

  const { error: tokenErr } = await admin
    .from("tokens")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("id", availableToken.id)
    .eq("status", "available");
  if (tokenErr) return { ok: false, message: "Erreur lors de l'utilisation du token." };

  const { error: usageErr } = await admin.from("power_usages").insert({
    token_id: availableToken.id,
    power_id: power.id,
    initiator_id: user.id,
    target_id: parsed.data.targetId ?? null,
    round_id: parsed.data.roundId,
    state: "declared",
    snapshot_before: snapshotBefore,
  });

  if (usageErr) {
    await admin.from("tokens").update({ status: "available", used_at: null }).eq("id", availableToken.id);
    return { ok: false, message: usageErr.message };
  }

  await admin.from("events").insert({
    kind: "power_declared",
    season_id: seasonId,
    round_id: parsed.data.roundId,
    actor_id: user.id,
    target_id: parsed.data.targetId ?? null,
    payload: { power_code: power.code, power_emoji: power.emoji, power_name: power.name },
  });

  revalidatePath("/journee");
  revalidatePath("/classement");
  return { ok: true, message: `${power.emoji} ${power.name} activé !` };
}

export async function cancelPower(
  usageId: string,
): Promise<{ ok: boolean; message: string }> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, message: "Session expirée." };

  const admin = createAdminClient();

  const { data: usage } = await admin
    .from("power_usages")
    .select("id, token_id, initiator_id, state, round_id")
    .eq("id", usageId)
    .single();

  if (!usage) return { ok: false, message: "Utilisation introuvable." };
  if ((usage.initiator_id as string) !== user.id) return { ok: false, message: "Ce n'est pas ton pouvoir." };
  if ((usage.state as string) !== "declared") return { ok: false, message: "Impossible d'annuler à ce stade." };

  const { data: round } = await admin
    .from("rounds")
    .select("status")
    .eq("id", usage.round_id as string)
    .single();
  if (round && (round.status as string) === "settled") {
    return { ok: false, message: "La journée est clôturée, impossible d'annuler." };
  }

  await admin.from("power_usages").update({ state: "cancelled" }).eq("id", usageId);
  await admin.from("tokens").update({ status: "available", used_at: null }).eq("id", usage.token_id as string);

  revalidatePath("/journee");
  return { ok: true, message: "Pouvoir annulé, token restitué." };
}

export async function resolveRoundPowers(
  roundId: string,
): Promise<AdminActionState> {
  const ctx = await requireAdmin();
  const admin = createAdminClient();
  const seasonId = await currentSeasonId(admin);

  const usages = await loadRoundUsages(admin, roundId);
  const active = usages.filter((u) => u.state === "declared" || u.state === "accepted");

  if (active.length === 0) {
    return { status: "success", message: "Aucun pouvoir à résoudre." };
  }

  const powers = await loadActivePowers(admin);
  const powerMap = new Map(powers.map((p) => [p.id, p]));
  const fixtureScores = await loadFixtureScoresForRound(admin, roundId);
  const roundTotals = await loadRoundTotals(admin, roundId);

  let resolved = 0;

  for (const usage of active) {
    const power = powerMap.get(usage.powerId);
    if (!power) continue;

    const pk = requirePower(power.code);
    const ctx_resolve: ResolveContext = { usage, power, fixtureScores, roundTotals };
    const result = pk.resolve(ctx_resolve);

    for (const adj of result.adjustments) {
      if (adj.delta === 0) continue;
      await admin.from("point_adjustments").insert({
        user_id: adj.userId,
        season_id: seasonId,
        round_id: roundId,
        delta: adj.delta,
        reason: adj.reason,
        source: `power:${power.code}`,
        source_id: usage.id,
        created_by: ctx.userId,
      });
    }

    await admin
      .from("power_usages")
      .update({
        state: "resolved",
        result: result.outcome,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", usage.id);

    if (result.adjustments.length > 0) {
      await admin.from("events").insert({
        kind: "power_resolved",
        season_id: seasonId,
        round_id: roundId,
        actor_id: usage.initiatorId,
        target_id: usage.targetId,
        payload: {
          power_code: power.code,
          power_emoji: power.emoji,
          power_name: power.name,
          outcome: result.outcome,
        },
      });
    }

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
  };
}

export async function grantTokens(
  input: unknown,
): Promise<AdminActionState> {
  const schema = z.object({
    period: z.enum(["first_half", "second_half", "full_season"]),
    count: z.number().int().min(1).max(10),
  });

  const ctx = await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Données invalides." };

  const admin = createAdminClient();
  const seasonId = await currentSeasonId(admin);

  const { data: members } = await admin
    .from("group_members")
    .select("user_id");

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
