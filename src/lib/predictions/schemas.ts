import { z } from "zod";

/**
 * Validation serveur des pronostics.
 *
 * L'écran valide déjà — et alors ? Une action serveur est une API publique :
 * elle reçoit ce qu'on veut bien lui envoyer. Tout ce qui entre passe par ici.
 */

export const outcomeSchema = z.enum(["home", "draw", "away"]);

/** Un score de rugby ne dépasse pas 200 points, et n'est jamais négatif. */
const scoreSchema = z.number().int().min(0).max(200);

export const predictionInputSchema = z
  .object({
    fixtureId: z.uuid(),
    outcome: outcomeSchema,
    marginBucketId: z.uuid().nullable().default(null),
    marginValue: z.number().int().min(0).max(200).nullable().default(null),
    exactHomeScore: scoreSchema.nullable().default(null),
    exactAwayScore: scoreSchema.nullable().default(null),
  })
  .refine(
    (p) =>
      (p.exactHomeScore === null) === (p.exactAwayScore === null),
    { message: "Un score exact se saisit en entier : les deux scores ou aucun." },
  )
  .refine(
    (p) => {
      if (p.exactHomeScore === null || p.exactAwayScore === null) return true;
      const implied =
        p.exactHomeScore > p.exactAwayScore
          ? "home"
          : p.exactHomeScore < p.exactAwayScore
            ? "away"
            : "draw";
      return implied === p.outcome;
    },
    { message: "Le score exact doit désigner le vainqueur choisi." },
  );

export type PredictionInput = z.infer<typeof predictionInputSchema>;

export const saveRoundSchema = z.object({
  roundId: z.uuid(),
  predictions: z.array(predictionInputSchema).min(1).max(30),
});

export type SaveRoundInput = z.infer<typeof saveRoundSchema>;

export const roundIdSchema = z.object({ roundId: z.uuid() });

/** L'issue impliquée par un score exact. */
export function impliedOutcome(home: number, away: number) {
  if (home > away) return "home" as const;
  if (home < away) return "away" as const;
  return "draw" as const;
}
