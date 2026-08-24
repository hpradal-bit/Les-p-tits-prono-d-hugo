import { z } from "zod";
import { defineKind, breakdown, byUserId, points } from "../kind.ts";

const configSchema = z.object({
  options: z
    .array(z.object({ value: z.string().min(1), label: z.string().min(1) }))
    .min(2),
});

const scoringSchema = z.object({
  correct: z.number().int().min(0),
});

type Config = z.infer<typeof configSchema>;

export const singleChoice = defineKind({
  kind: "single_choice",
  label: "Choix unique",
  help: "Le joueur choisit une option parmi plusieurs.",

  configSchema,
  scoringSchema,
  configExample: {
    options: [
      { value: "a", label: "Option A" },
      { value: "b", label: "Option B" },
      { value: "c", label: "Option C" },
    ],
  },
  scoringExample: { correct: 3 },
  configHelp:
    "options : tableau de {value, label}. Au moins 2 options.",
  scoringHelp: "correct : nombre de points pour la bonne réponse.",

  answerSchema: (config: Config) =>
    z.object({
      value: z.enum(
        config.options.map((o) => o.value) as [string, ...string[]],
      ),
    }),
  correctSchema: (config: Config) =>
    z.object({
      value: z.enum(
        config.options.map((o) => o.value) as [string, ...string[]],
      ),
    }),

  answerFields: (config: Config) => [
    {
      name: "value",
      label: "Réponse",
      widget: "choice" as const,
      options: config.options,
      required: true,
    },
  ],

  correctFields: (config: Config) => [
    {
      name: "value",
      label: "Bonne réponse",
      widget: "choice" as const,
      options: config.options,
      required: true,
    },
  ],

  formatAnswer: (a, config: Config) =>
    config.options.find((o) => o.value === a.value)?.label ?? a.value,
  formatCorrect: (c, config: Config) =>
    config.options.find((o) => o.value === c.value)?.label ?? c.value,
  describeScoring: (s) => `${points(s.correct)} si bonne réponse.`,

  grade: ({ scoring, correctAnswer, entries }) =>
    entries
      .map((e) => {
        const ok = e.answer.value === correctAnswer.value;
        return {
          userId: e.userId,
          points: ok ? scoring.correct : 0,
          breakdown: breakdown(
            "single_choice",
            ok ? "correct" : "wrong",
            ok ? `Bonne réponse (+${scoring.correct})` : "Mauvaise réponse",
          ),
        };
      })
      .sort(byUserId),
});
