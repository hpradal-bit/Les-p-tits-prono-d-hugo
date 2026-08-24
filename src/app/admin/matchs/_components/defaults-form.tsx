"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { applyRoundDefaultsAction } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";

/**
 * Pose les pronostics par défaut sur une journée verrouillée.
 *
 * Le planificateur le fait déjà à chaque passage. Ce bouton est le filet du
 * jour où il n'aura pas tourné — et le seul moyen de vérifier, avant la
 * première journée, que le rattrapage des oublis fonctionne vraiment.
 */
export function DefaultsForm({ roundId }: { roundId: string }) {
  const [state, action, pending] = useActionState(applyRoundDefaultsAction, ADMIN_IDLE);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="roundId" value={roundId} />
      <input
        type="hidden"
        name="reason"
        value="Pronostics par défaut posés à la main depuis l'espace admin"
      />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? "Pose en cours…" : "Poser les pronostics par défaut"}
      </Button>
      <span className="text-[12px] leading-snug text-ink-faint">
        Pour les joueurs qui n&apos;ont rien joué avant le verrouillage. Rejouable : relancer
        ne double aucun pronostic.
      </span>
      {state.status !== "idle" && state.message && (
        <p className={`text-[13px] ${state.status === "success" ? "text-winner" : "text-wrong"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
