import { z } from "zod";
import { defineKind, breakdown, byUserId, points } from "../kind.ts";

const configSchema = z.object({});
const scoringSchema = z.object({
  correct: z.number().int().min(0),
});

const answerSchema = z.object({ value: z.enum(["yes", "no"]) });
const correctSchema = z.object({ value: z.enum(["yes", "no"]) });

export const yesNo = defineKind({
  kind: "yes_no",
  label: "Oui / Non",
  help: "Une question fermée, deux réponses possibles.",

  configSchema,
  scoringSchema,
  configExample: {},
  scoringExample: { correct: 3 },
  configHelp: "Aucune configuration nécessaire.",
  scoringHelp: "correct : nombre de points pour la bonne réponse.",

  answerSchema: () => answerSchema,
  correctSchema: () => correctSchema,

  answerFields: () => [
    {
      name: "value",
      label: "Réponse",
      widget: "boolean" as const,
      trueLabel: "Oui",
      falseLabel: "Non",
      required: true,
    },
  ],

  correctFields: () => [
    {
      name: "value",
      label: "Bonne réponse",
      widget: "boolean" as const,
      trueLabel: "Oui",
      falseLabel: "Non",
      required: true,
    },
  ],

  formatAnswer: (a) => (a.value === "yes" ? "Oui" : "Non"),
  formatCorrect: (c) => (c.value === "yes" ? "Oui" : "Non"),
  describeScoring: (s) => `${points(s.correct)} si bonne réponse.`,

  grade: ({ scoring, correctAnswer, entries }) =>
    entries
      .map((e) => {
        const ok = e.answer.value === correctAnswer.value;
        return {
          userId: e.userId,
          points: ok ? scoring.correct : 0,
          breakdown: breakdown(
            "yes_no",
            ok ? "correct" : "wrong",
            ok ? `Bonne réponse (+${scoring.correct})` : "Mauvaise réponse",
          ),
        };
      })
      .sort(byUserId),
});
