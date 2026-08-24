import { z } from "zod";
import { defineKind, breakdown, byUserId, points } from "../kind.ts";

const optionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

const configSchema = z.object({
  options: z.array(optionSchema).min(3),
  count: z.number().int().min(1).max(10).default(3),
  labels: z.array(z.string()).optional(),
});

const scoringSchema = z.object({
  exact_position: z.number().int().min(0),
  in_podium: z.number().int().min(0),
});

type Config = z.infer<typeof configSchema>;

function posLabels(config: Config): string[] {
  if (config.labels && config.labels.length >= config.count) return config.labels;
  return Array.from({ length: config.count }, (_, i) =>
    i === 0 ? "1er" : `${i + 1}e`,
  );
}

export const podium = defineKind({
  kind: "podium",
  label: "Podium / Classement",
  help: "Le joueur place N equipes dans l'ordre. Ideal pour predire un top 3 ou un bottom 3.",

  configSchema,
  scoringSchema,
  configExample: {
    options: [
      { value: "a", label: "Equipe A" },
      { value: "b", label: "Equipe B" },
      { value: "c", label: "Equipe C" },
    ],
    count: 3,
  },
  scoringExample: { exact_position: 5, in_podium: 2 },
  configHelp:
    "options : tableau de {value, label}. count : nombre de places a predire. labels : noms des positions (optionnel).",
  scoringHelp:
    "exact_position : points si l'equipe est a la bonne place. in_podium : points si l'equipe est dans la selection mais mal placee.",

  answerSchema: (config: Config) =>
    z.object({
      picks: z
        .array(z.enum(config.options.map((o) => o.value) as [string, ...string[]]))
        .length(config.count),
    }),

  correctSchema: (config: Config) =>
    z.object({
      picks: z
        .array(z.enum(config.options.map((o) => o.value) as [string, ...string[]]))
        .length(config.count),
    }),

  answerFields: (config: Config) => {
    const labs = posLabels(config);
    return Array.from({ length: config.count }, (_, i) => ({
      name: `pick_${i}`,
      label: labs[i] ?? `${i + 1}e`,
      widget: "choice" as const,
      options: config.options,
      required: true,
    }));
  },

  correctFields: (config: Config) => {
    const labs = posLabels(config);
    return Array.from({ length: config.count }, (_, i) => ({
      name: `pick_${i}`,
      label: labs[i] ?? `${i + 1}e`,
      widget: "choice" as const,
      options: config.options,
      required: true,
    }));
  },

  formatAnswer: (a, config: Config) => {
    const labs = posLabels(config);
    return a.picks
      .map((v: string, i: number) => {
        const lbl = config.options.find((o) => o.value === v)?.label ?? v;
        return `${labs[i]} ${lbl}`;
      })
      .join(", ");
  },

  formatCorrect: (c, config: Config) => {
    const labs = posLabels(config);
    return c.picks
      .map((v: string, i: number) => {
        const lbl = config.options.find((o) => o.value === v)?.label ?? v;
        return `${labs[i]} ${lbl}`;
      })
      .join(", ");
  },

  describeScoring: (s) =>
    `${points(s.exact_position)} par equipe a la bonne place, ${points(s.in_podium)} si presente mais mal placee.`,

  grade: ({ scoring, correctAnswer, entries }) =>
    entries
      .map((e) => {
        const correct: string[] = correctAnswer.picks;
        const picks: string[] = e.answer.picks;
        let total = 0;
        const details: string[] = [];

        for (let i = 0; i < picks.length; i++) {
          if (picks[i] === correct[i]) {
            total += scoring.exact_position;
            details.push(`${picks[i]}:exact`);
          } else if (correct.includes(picks[i])) {
            total += scoring.in_podium;
            details.push(`${picks[i]}:present`);
          } else {
            details.push(`${picks[i]}:absent`);
          }
        }

        const outcome = total > 0 ? (total >= scoring.exact_position * picks.length ? "correct" : "partial") : "wrong";

        return {
          userId: e.userId,
          points: total,
          breakdown: breakdown(
            "podium",
            outcome,
            total > 0
              ? `+${total} (${details.filter((d) => d.includes("exact")).length} bonne${details.filter((d) => d.includes("exact")).length > 1 ? "s" : ""} position${details.filter((d) => d.includes("exact")).length > 1 ? "s" : ""})`
              : "Aucune equipe correcte",
            { picks, correct, total },
          ),
        };
      })
      .sort(byUserId),
});
