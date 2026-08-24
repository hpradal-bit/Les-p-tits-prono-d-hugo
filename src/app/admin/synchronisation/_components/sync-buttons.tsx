"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { runCalendarSync, runLiveSync, runStandingsSync } from "@/lib/admin/actions";
import { ADMIN_IDLE, type AdminActionState } from "@/lib/admin/types";

/**
 * Les trois boutons de synchronisation.
 *
 * Chacun affiche le rapport complet du fournisseur, réussite comprise : savoir
 * *combien* de matchs sont remontés vaut mieux qu'un « c'est fait » — un
 * calendrier qui répond « 0 match reçu » est un échec déguisé en succès.
 */

type SyncAction = (
  prev: AdminActionState,
  formData: FormData,
) => Promise<AdminActionState>;

function SyncButton({
  action,
  label,
  pendingLabel,
  reason,
  hint,
  variant = "ghost",
}: {
  action: SyncAction;
  label: string;
  pendingLabel: string;
  reason: string;
  hint: string;
  variant?: "primary" | "ghost";
}) {
  const [state, formAction, pending] = useActionState(action, ADMIN_IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="reason" value={reason} />
      <div className="flex flex-wrap items-center gap-2.5">
        <Button type="submit" size="sm" variant={variant} disabled={pending}>
          {pending ? pendingLabel : label}
        </Button>
        <span className="text-[12px] text-ink-faint">{hint}</span>
      </div>

      {state.status !== "idle" && state.message && (
        <div
          role="status"
          className={`flex flex-col gap-1 rounded-lg px-3 py-2.5 text-[13.5px] ${
            state.status === "success" ? "bg-winner-soft text-winner" : "bg-wrong-soft text-wrong"
          }`}
        >
          <span className="font-semibold">{state.message}</span>
          {state.details?.map((d) => (
            <span key={d} className="font-mono text-[11.5px] leading-snug opacity-85">
              {d}
            </span>
          ))}
        </div>
      )}
    </form>
  );
}

export function SyncButtons() {
  return (
    <div className="flex flex-col gap-4">
      <SyncButton
        action={runCalendarSync}
        variant="primary"
        label="Synchroniser le calendrier"
        pendingLabel="Interrogation du fournisseur…"
        reason="Synchronisation du calendrier déclenchée depuis l'espace admin"
        hint="Matchs, horaires et journées. À lancer en premier."
      />
      <SyncButton
        action={runLiveSync}
        label="Relever les scores"
        pendingLabel="Relevé en cours…"
        reason="Relevé des scores déclenché depuis l'espace admin"
        hint="Forcé, même hors fenêtre de match."
      />
      <SyncButton
        action={runStandingsSync}
        label="Rafraîchir le classement sportif"
        pendingLabel="Rafraîchissement…"
        reason="Classement sportif rafraîchi depuis l'espace admin"
        hint="Le vrai classement du Top 14, pas celui des pronostiqueurs."
      />
    </div>
  );
}
