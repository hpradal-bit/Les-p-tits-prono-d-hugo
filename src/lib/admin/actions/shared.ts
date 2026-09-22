import { z } from "zod";
import { AdminError } from "../auth";
import { MissingReasonError } from "../log";
import { adminFail, type AdminActionState } from "../types";
import { logger } from "@/lib/log";

/**
 * Petites choses communes à toutes les actions d'admin — extraites de
 * l'ancien `actions.ts` (1846 lignes) lors de son découpage par domaine
 * (audit technique, tâche « Split admin/actions.ts »). Pas de « use server »
 * ici : ce fichier n'exporte aucune Server Action, seulement des utilitaires
 * synchrones partagés par les modules qui en exportent.
 */

/** Zod rend des tableaux éventuellement absents : on les rend exploitables. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(error.flatten().fieldErrors).filter(
      (entry): entry is [string, string[]] => Array.isArray(entry[1]),
    ),
  );
}

export function handle(error: unknown): AdminActionState {
  if (error instanceof MissingReasonError) {
    return adminFail("La raison est obligatoire.", { fieldErrors: { reason: [error.message] } });
  }
  if (error instanceof AdminError) return adminFail(error.message);
  logger.error("admin.action_failed", { error });
  return adminFail("L'action a échoué. Réessaie dans un instant.");
}
