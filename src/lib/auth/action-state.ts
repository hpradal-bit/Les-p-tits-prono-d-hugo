/**
 * Chantier A — état renvoyé par les actions serveur des formulaires.
 *
 * Volontairement pauvre : un message global, des messages par champ, et un
 * drapeau de succès. Les écrans le consomment avec `useActionState`.
 */
export interface ActionState {
  status: "idle" | "success" | "error";
  /** Message global, affiché en tête de formulaire. */
  message?: string;
  /** Messages rattachés à un champ, affichés sous celui-ci. */
  fieldErrors?: Record<string, string[]>;
}

export const IDLE: ActionState = { status: "idle" };

export function failure(message: string, fieldErrors?: Record<string, string[]>): ActionState {
  return { status: "error", message, fieldErrors };
}

export function success(message: string): ActionState {
  return { status: "success", message };
}
