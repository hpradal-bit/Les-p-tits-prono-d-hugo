import { z } from "zod";
import { defineKind, breakdown, byUserId, points } from "../kind.ts";

const configSchema = z.object({
  min: z.number().int().optional(),
  max: z.number().int().optional(),
  unit: z.string().optional(),
});

const scoringSchema = z.object({
  exact: z.number().int().min(0),
  closest: z.number().int().min(0),
});

type Config = z.infer<typeof configSchema>;
type Scoring = z.infer<typeof scoringSchema>;

export const numericClosest = defineKind({
  kind: "numeric_closest",
  label: "Le plus proche",
  help: "Le joueur propose un nombre. Celui qui est le plus proche de la bonne réponse gagne le plus de points.",

  configSchema,
  scoringSchema,
  configExample: { min: 0, max: 100, unit: "points" },
  scoringExample: { exact: 5, closest: 3 },
  configHelp:
    "min/max : bornes optionnelles. unit : unité affichée (ex : « points »).",
  scoringHelp:
    "exact : points si la réponse est pile. closest : points pour le(s) plus proche(s).",

  answerSchema: (config: Config) =>
    z.object({
      value: z
        .number()
        .int()
        .min(config.min ?? -Infinity)
        .max(config.max ?? Infinity),
    }),
  correctSchema: () => z.object({ value: z.number().int() }),

  answerFields: (config: Config) => [
    {
      name: "value",
      label: "Réponse",
      widget: "number" as const,
      min: config.min,
      max: config.max,
      step: 1,
      unit: config.unit,
      required: true,
    },
  ],

  correctFields: () => [
    {
      name: "value",
      label: "Bonne réponse",
      widget: "number" as const,
      step: 1,
      required: true,
    },
  ],

  formatAnswer: (a, config: Config) =>
    config.unit ? `${a.value} ${config.unit}` : String(a.value),
  formatCorrect: (c, config: Config) =>
    config.unit ? `${c.value} ${config.unit}` : String(c.value),
  describeScoring: (s: Scoring, config: Config) => {
    const u = config.unit ? ` ${config.unit}` : "";
    return `Pile = ${points(s.exact)}. Le plus proche = ${points(s.closest)}${u}.`;
  },

  grade: ({ scoring, correctAnswer, entries }) => {
    if (entries.length === 0) return [];

    const correct = correctAnswer.value;
    const withDist = entries.map((e) => ({
      ...e,
      dist: Math.abs(e.answer.value - correct),
    }));

    const nonExact = withDist.filter((w) => w.dist > 0);
    const minDist = nonExact.length > 0 ? Math.min(...nonExact.map((w) => w.dist)) : Infinity;

    return withDist
      .map((e) => {
        if (e.dist === 0) {
          return {
            userId: e.userId,
            points: scoring.exact,
            breakdown: breakdown("numeric_closest", "correct", `Réponse exacte (+${scoring.exact})`, {
              answer: e.answer.value,
              correct,
              distance: 0,
            }),
          };
        }
        if (e.dist === minDist) {
          return {
            userId: e.userId,
            points: scoring.closest,
            breakdown: breakdown(
              "numeric_closest",
              "partial",
              `Le plus proche (+${scoring.closest})`,
              { answer: e.answer.value, correct, distance: e.dist },
            ),
          };
        }
        return {
          userId: e.userId,
          points: 0,
          breakdown: breakdown("numeric_closest", "wrong", "Pas le plus proche", {
            answer: e.answer.value,
            correct,
            distance: e.dist,
          }),
        };
      })
      .sort(byUserId);
  },
});
