/**
 * Questions bonus — types du domaine.
 *
 * Les colonnes `config`, `scoring`, `answer`, `correct_answer` et `breakdown`
 * sont des JSON dont la forme dépend du type de question. Ils circulent donc
 * en `unknown` jusqu'à ce que le module du type les valide avec Zod.
 */

import type { Uuid } from "@/lib/types";

export type BonusQuestionStatus = "draft" | "open" | "closed" | "settled";

/** Où s'accroche la question : à une journée, ou à la saison entière. */
export type BonusScope = "season" | "round";

/** Le verdict d'une réponse, aligné sur le code couleur du jeu. */
export type BonusOutcome = "wrong" | "partial" | "correct";

/** Le « pourquoi j'ai eu 5 points », stocké dans bonus_scores.breakdown. */
export interface BonusBreakdown {
  kind: string;
  outcome: BonusOutcome;
  /** Phrase affichée au joueur, en français. */
  label: string;
  /** Valeurs brutes utiles à l'affichage (écart, rang, option choisie…). */
  detail?: Record<string, unknown>;
  /** Renseigné uniquement quand l'admin a forcé la note à la main. */
  manual?: { by: Uuid | null; reason: string; autoPoints: number };
}

export interface GradedAnswer {
  userId: Uuid;
  points: number;
  breakdown: BonusBreakdown;
}

export interface BonusQuestion {
  id: Uuid;
  seasonId: Uuid;
  roundId: Uuid | null;
  roundName: string | null;
  roundNumber: number | null;
  kind: string;
  prompt: string;
  config: unknown;
  scoring: unknown;
  opensAt: string | null;
  closesAt: string | null;
  status: BonusQuestionStatus;
  createdAt: string;
}

export interface BonusPlayer {
  id: Uuid;
  displayName: string;
  avatarKind: "emoji" | "photo" | "club";
  avatarValue: string;
}

export interface BonusAnswerRow {
  userId: Uuid;
  answer: unknown;
  updatedAt: string;
}

export interface BonusResult {
  correctAnswer: unknown;
  settledAt: string;
  settledBy: Uuid | null;
}

export interface BonusScoreRow {
  userId: Uuid;
  points: number;
  breakdown: BonusBreakdown;
}

/** Tout ce qu'un écran doit savoir sur une question, en un seul objet. */
export interface BonusQuestionView {
  question: BonusQuestion;
  /** La réponse du joueur connecté, s'il en a donné une. */
  myAnswer: BonusAnswerRow | null;
  /** Les réponses visibles : les siennes, et celles des autres après fermeture. */
  answers: BonusAnswerRow[];
  answerCount: number;
  result: BonusResult | null;
  scores: BonusScoreRow[];
}

/** La question accepte-t-elle une réponse en ce moment ? */
export function isAnswerable(q: BonusQuestion, now = new Date()): boolean {
  if (q.status !== "open") return false;
  if (q.opensAt && new Date(q.opensAt) > now) return false;
  if (q.closesAt && new Date(q.closesAt) <= now) return false;
  return true;
}

/**
 * Les réponses des autres sont-elles visibles ?
 * Copie exacte de la politique RLS `bonus_answers_read` : l'écran ne montre
 * jamais plus que ce que la base accepterait de renvoyer.
 */
export function answersArePublic(q: BonusQuestion, now = new Date()): boolean {
  if (q.status === "closed" || q.status === "settled") return true;
  return q.closesAt !== null && new Date(q.closesAt) <= now;
}

export function scopeOf(q: BonusQuestion): BonusScope {
  return q.roundId === null ? "season" : "round";
}
