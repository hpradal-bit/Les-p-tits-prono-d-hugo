"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/lib/auth/action-state";

/**
 * Briques de formulaire propres au chantier A.
 *
 * Elles ne montent pas dans `src/components/ui` : un champ de saisie n'est pas
 * encore une primitive partagée du projet, et ce fichier appartient à plusieurs
 * chantiers. Le jour où un autre écran en a besoin, on le remontera — avec
 * l'accord de tout le monde.
 */

export function Field({
  label,
  htmlFor,
  hint,
  errors,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  const errorId = `${htmlFor}-erreur`;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint"
      >
        {label}
      </label>
      {children}
      {hint && !errors?.length && <p className="text-[13px] text-ink-faint">{hint}</p>}
      {errors?.length ? (
        <p id={errorId} className="text-[13px] font-medium text-wrong">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}

export function Input({
  invalid,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${props.id}-erreur` : undefined}
      className={cn(
        "w-full rounded-xl border bg-surface px-3.5 py-2.5 text-[15px] text-ink",
        "placeholder:text-ink-faint",
        "transition focus:outline-none focus-visible:border-pine",
        invalid ? "border-wrong" : "border-line",
        className,
      )}
      {...props}
    />
  );
}

/** Bandeau de résultat : erreur globale ou confirmation. */
export function Alert({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;

  const bad = state.status === "error";
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-xl px-3.5 py-2.5 text-[14px] font-medium",
        bad ? "bg-wrong-soft text-wrong" : "bg-winner-soft text-winner",
      )}
    >
      {state.message}
    </p>
  );
}

/** Bouton d'envoi, désactivé et bavard pendant l'aller-retour serveur. */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? (pendingLabel ?? "Un instant…") : children}
    </Button>
  );
}
