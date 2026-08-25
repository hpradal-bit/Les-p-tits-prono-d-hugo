"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { currentSeasonId } from "@/lib/admin/queries";
import { requireKind } from "./registry.ts";
import { enqueue } from "@/lib/push/notify.ts";
import { dedupeKey } from "@/lib/push/schedule.ts";
import { flushDue } from "@/lib/push/notify.ts";
import type { AdminActionState } from "@/lib/admin/types";

const createSchema = z.object({
  kind: z.string().min(1),
  prompt: z.string().min(3).max(500),
  roundId: z.string().uuid().nullable().optional(),
  config: z.unknown().optional(),
  scoring: z.unknown().optional(),
  deadlineMinutes: z.number().int().min(0).optional(),
});

const settleSchema = z.object({
  questionId: z.string().uuid(),
  correctAnswer: z.unknown(),
});

const answerSchema = z.object({
  questionId: z.string().uuid(),
  answer: z.unknown(),
});

export async function createBonusQuestion(
  input: unknown,
): Promise<AdminActionState> {
  const ctx = await requireAdmin();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Données invalides." };

  const kd = requireKind(parsed.data.kind);
  const config = parsed.data.config ?? kd.configExample;
  const scoring = parsed.data.scoring ?? kd.scoringExample;

  try {
    kd.parseConfig(config);
    kd.parseScoring(scoring);
  } catch {
    return { status: "error", message: "Configuration ou barème invalide." };
  }

  const admin = createAdminClient();
  const seasonId = await currentSeasonId(admin);

  const deadlineMinutes = parsed.data.deadlineMinutes ?? null;
  const storedConfig = deadlineMinutes
    ? { ...(config as Record<string, unknown>), deadlineMinutes }
    : config;

  const { data, error } = await admin.from("bonus_questions").insert({
    season_id: seasonId,
    round_id: parsed.data.roundId ?? null,
    kind: parsed.data.kind,
    prompt: parsed.data.prompt,
    config: storedConfig,
    scoring,
    status: "draft",
    created_by: ctx.userId,
  }).select("id").single();

  if (error) return { status: "error", message: error.message };

  await admin.from("admin_actions").insert({
    admin_id: ctx.userId,
    action: "bonus.question_created",
    entity_type: "bonus_question",
    entity_id: data.id,
    reason: `Question créée : ${parsed.data.prompt.slice(0, 80)}`,
  });

  revalidatePath("/admin/bonus");
  return { status: "success", message: "Question créée." };
}

export async function openBonusQuestion(
  questionId: string,
): Promise<AdminActionState> {
  const ctx = await requireAdmin();
  const admin = createAdminClient();

  const { data: q } = await admin
    .from("bonus_questions")
    .select("id, status, prompt, config")
    .eq("id", questionId)
    .single();

  if (!q) return { status: "error", message: "Question introuvable." };
  if (q.status !== "draft") return { status: "error", message: "Seul un brouillon peut être ouvert." };

  const now = new Date();
  const cfg = q.config as Record<string, unknown> | null;
  const deadlineMin = typeof cfg?.deadlineMinutes === "number" ? cfg.deadlineMinutes : null;
  const closesAt = deadlineMin
    ? new Date(now.getTime() + deadlineMin * 60_000).toISOString()
    : null;

  const { error } = await admin
    .from("bonus_questions")
    .update({
      status: "open",
      opens_at: now.toISOString(),
      ...(closesAt ? { closes_at: closesAt } : {}),
    })
    .eq("id", questionId);
  if (error) return { status: "error", message: error.message };

  await admin.from("admin_actions").insert({
    admin_id: ctx.userId,
    action: "bonus.question_opened",
    entity_type: "bonus_question",
    entity_id: questionId,
    reason: `Question ouverte : ${(q.prompt as string).slice(0, 80)}`,
  });

  await admin.from("events").insert({
    kind: "bonus_question",
    season_id: await currentSeasonId(admin),
    actor_id: ctx.userId,
    payload: { prompt: q.prompt },
  });

  const { data: members } = await admin
    .from("group_members")
    .select("user_id");

  for (const m of members ?? []) {
    await enqueue(admin, {
      userId: m.user_id as string,
      kind: "bonus_question",
      title: "🎯 Nouvelle question bonus !",
      body: (q.prompt as string).slice(0, 120),
      url: "/questions",
      dedupeKey: dedupeKey("bonus_question", questionId),
    });
  }
  await flushDue(admin);

  revalidatePath("/admin/bonus");
  revalidatePath("/questions");
  revalidatePath("/journee");
  return { status: "success", message: "Question ouverte et notifications envoyées." };
}

export async function closeBonusQuestion(
  questionId: string,
): Promise<AdminActionState> {
  const ctx = await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("bonus_questions")
    .update({ status: "closed", closes_at: new Date().toISOString() })
    .eq("id", questionId);
  if (error) return { status: "error", message: error.message };

  await admin.from("admin_actions").insert({
    admin_id: ctx.userId,
    action: "bonus.question_closed",
    entity_type: "bonus_question",
    entity_id: questionId,
    reason: "Question fermée aux réponses.",
  });

  revalidatePath("/admin/bonus");
  revalidatePath("/questions");
  revalidatePath("/journee");
  return { status: "success", message: "Question fermée." };
}

export async function settleBonusQuestion(
  input: unknown,
): Promise<AdminActionState> {
  const ctx = await requireAdmin();
  const parsed = settleSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Données invalides." };

  const admin = createAdminClient();

  const { data: q } = await admin
    .from("bonus_questions")
    .select("id, kind, config, scoring, status, prompt")
    .eq("id", parsed.data.questionId)
    .single();

  if (!q) return { status: "error", message: "Question introuvable." };
  if (q.status !== "open" && q.status !== "closed") {
    return { status: "error", message: "La question doit être ouverte ou fermée pour être réglée." };
  }

  const kd = requireKind(q.kind as string);

  let correctAnswer: unknown;
  try {
    correctAnswer = kd.parseCorrect(parsed.data.correctAnswer, q.config);
  } catch {
    return { status: "error", message: "La bonne réponse est invalide pour ce type de question." };
  }

  const { data: rawAnswers } = await admin
    .from("bonus_answers")
    .select("user_id, answer")
    .eq("question_id", q.id);

  const entries = (rawAnswers ?? []).map((r) => ({
    userId: r.user_id as string,
    answer: kd.parseAnswer(r.answer, q.config),
  }));

  const grades = kd.grade({
    config: kd.parseConfig(q.config),
    scoring: kd.parseScoring(q.scoring),
    correctAnswer,
    entries,
  });

  await admin.from("bonus_results").upsert({
    question_id: q.id,
    correct_answer: correctAnswer,
    settled_at: new Date().toISOString(),
    settled_by: ctx.userId,
  });

  for (const g of grades) {
    await admin.from("bonus_scores").upsert({
      question_id: q.id,
      user_id: g.userId,
      points: g.points,
      breakdown: g.breakdown,
      computed_at: new Date().toISOString(),
    });
  }

  await admin
    .from("bonus_questions")
    .update({ status: "settled" })
    .eq("id", q.id);

  await admin.from("admin_actions").insert({
    admin_id: ctx.userId,
    action: "bonus.question_settled",
    entity_type: "bonus_question",
    entity_id: q.id,
    reason: `Question réglée : ${(q.prompt as string).slice(0, 80)}`,
  });

  revalidatePath("/admin/bonus");
  revalidatePath("/questions");
  revalidatePath("/journee");
  revalidatePath("/classement");
  return {
    status: "success",
    message: `Question réglée. ${grades.length} réponse${grades.length > 1 ? "s" : ""} corrigée${grades.length > 1 ? "s" : ""}.`,
  };
}

export async function answerBonusQuestion(
  input: unknown,
): Promise<{ ok: boolean; message: string }> {
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Données invalides." };

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, message: "Session expirée." };

  const admin = createAdminClient();
  const { data: q } = await admin
    .from("bonus_questions")
    .select("id, kind, config, status, opens_at, closes_at")
    .eq("id", parsed.data.questionId)
    .single();

  if (!q) return { ok: false, message: "Question introuvable." };
  if (q.status !== "open") return { ok: false, message: "Cette question n'est plus ouverte." };

  if (q.closes_at && new Date(q.closes_at as string) <= new Date()) {
    return { ok: false, message: "Le délai de réponse est dépassé." };
  }

  const kd = requireKind(q.kind as string);
  let answer: unknown;
  try {
    answer = kd.parseAnswer(parsed.data.answer, q.config);
  } catch {
    return { ok: false, message: "Réponse invalide." };
  }

  const { error } = await sb.from("bonus_answers").upsert(
    {
      question_id: q.id,
      user_id: user.id,
      answer,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "question_id,user_id" },
  );

  if (error) return { ok: false, message: error.message };

  revalidatePath("/questions");
  revalidatePath("/journee");
  return { ok: true, message: "Réponse enregistrée !" };
}

export async function settleBonusFromStandings(
  questionId: string,
): Promise<AdminActionState> {
  const ctx = await requireAdmin();
  const admin = createAdminClient();

  const { data: q } = await admin
    .from("bonus_questions")
    .select("id, kind, config, scoring, status, prompt, season_id")
    .eq("id", questionId)
    .single();

  if (!q) return { status: "error", message: "Question introuvable." };
  if (q.kind !== "podium") return { status: "error", message: "Cette action est réservée aux questions Podium." };
  if (q.status !== "open" && q.status !== "closed") {
    return { status: "error", message: "La question doit être ouverte ou fermée." };
  }

  const config = q.config as { options: { value: string; label: string }[]; count: number; rankFrom?: "top" | "bottom" };
  const count = config.count ?? 3;
  const fromBottom = config.rankFrom === "bottom";

  const { data: standings, error: standErr } = await admin
    .from("competition_standings")
    .select("team_id, position")
    .eq("season_id", q.season_id as string)
    .order("position", { ascending: !fromBottom })
    .limit(count);

  if (standErr || !standings || standings.length === 0) {
    return { status: "error", message: "Classement sportif introuvable. Lancez une synchronisation d'abord." };
  }

  const teamIds = config.options.map((o) => o.value);
  const topTeamIds = standings.map((s) => s.team_id as string);
  const validPicks = topTeamIds.filter((id) => teamIds.includes(id));

  if (validPicks.length < count) {
    return {
      status: "error",
      message: `Seulement ${validPicks.length} équipe(s) du classement correspondent aux options de la question (${count} attendues).`,
    };
  }

  const correctAnswer = { picks: validPicks.slice(0, count) };

  return settleBonusQuestion({
    questionId,
    correctAnswer,
  });
}
