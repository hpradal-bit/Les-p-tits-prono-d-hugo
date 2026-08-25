import type { SupabaseClient } from "@supabase/supabase-js";
import type { Uuid } from "@/lib/types";
import type {
  BonusQuestion,
  BonusAnswerRow,
  BonusResult,
  BonusScoreRow,
  BonusQuestionView,
} from "./types.ts";

function toQuestion(row: Record<string, unknown>): BonusQuestion {
  return {
    id: row.id as string,
    seasonId: row.season_id as string,
    roundId: (row.round_id as string) ?? null,
    roundName: (row.rounds as { name: string } | null)?.name ?? null,
    roundNumber: (row.rounds as { number: number } | null)?.number ?? null,
    kind: row.kind as string,
    prompt: row.prompt as string,
    config: row.config,
    scoring: row.scoring,
    opensAt: (row.opens_at as string) ?? null,
    closesAt: (row.closes_at as string) ?? null,
    status: row.status as BonusQuestion["status"],
    createdAt: row.created_at as string,
  };
}

export async function listQuestions(
  sb: SupabaseClient,
  seasonId: Uuid,
): Promise<BonusQuestion[]> {
  const { data, error } = await sb
    .from("bonus_questions")
    .select("*, rounds(name, number)")
    .eq("season_id", seasonId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toQuestion);
}

export async function listOpenQuestions(
  sb: SupabaseClient,
  seasonId: Uuid,
): Promise<BonusQuestion[]> {
  const { data, error } = await sb
    .from("bonus_questions")
    .select("*, rounds(name, number)")
    .eq("season_id", seasonId)
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toQuestion);
}

export async function listOpenQuestionsWithAnswer(
  sb: SupabaseClient,
  seasonId: Uuid,
  viewerId: Uuid,
): Promise<{ question: BonusQuestion; myAnswer: BonusAnswerRow | null }[]> {
  const questions = await listOpenQuestions(sb, seasonId);
  if (questions.length === 0) return [];

  const ids = questions.map((q) => q.id);
  const { data: answers } = await sb
    .from("bonus_answers")
    .select("question_id, user_id, answer, updated_at")
    .in("question_id", ids)
    .eq("user_id", viewerId);

  const answerMap = new Map<string, BonusAnswerRow>();
  for (const a of answers ?? []) {
    answerMap.set(a.question_id as string, {
      userId: a.user_id as string,
      answer: a.answer,
      updatedAt: a.updated_at as string,
    });
  }

  return questions.map((q) => ({
    question: q,
    myAnswer: answerMap.get(q.id) ?? null,
  }));
}

export async function getQuestion(
  sb: SupabaseClient,
  questionId: Uuid,
): Promise<BonusQuestion | null> {
  const { data, error } = await sb
    .from("bonus_questions")
    .select("*, rounds(name, number)")
    .eq("id", questionId)
    .maybeSingle();
  if (error) throw error;
  return data ? toQuestion(data) : null;
}

export async function getQuestionView(
  sb: SupabaseClient,
  questionId: Uuid,
  viewerId: Uuid,
): Promise<BonusQuestionView | null> {
  const question = await getQuestion(sb, questionId);
  if (!question) return null;

  const [answersRes, resultRes, scoresRes] = await Promise.all([
    sb
      .from("bonus_answers")
      .select("user_id, answer, updated_at")
      .eq("question_id", questionId),
    sb
      .from("bonus_results")
      .select("correct_answer, settled_at, settled_by")
      .eq("question_id", questionId)
      .maybeSingle(),
    sb
      .from("bonus_scores")
      .select("user_id, points, breakdown")
      .eq("question_id", questionId),
  ]);

  const answers: BonusAnswerRow[] = (answersRes.data ?? []).map((r) => ({
    userId: r.user_id as string,
    answer: r.answer,
    updatedAt: r.updated_at as string,
  }));

  const myAnswer = answers.find((a) => a.userId === viewerId) ?? null;

  const result: BonusResult | null = resultRes.data
    ? {
        correctAnswer: resultRes.data.correct_answer,
        settledAt: resultRes.data.settled_at as string,
        settledBy: (resultRes.data.settled_by as string) ?? null,
      }
    : null;

  const scores: BonusScoreRow[] = (scoresRes.data ?? []).map((r) => ({
    userId: r.user_id as string,
    points: r.points as number,
    breakdown: r.breakdown as BonusScoreRow["breakdown"],
  }));

  return {
    question,
    myAnswer,
    answers,
    answerCount: answers.length,
    result,
    scores,
  };
}
