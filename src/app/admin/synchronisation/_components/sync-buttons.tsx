"use client";

import { useActionState, useState } from "react";
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

export interface SeasonChoice {
  id: string;
  label: string;
  competition: string;
  isActive: boolean;
}

function SyncButton({
  action,
  label,
  pendingLabel,
  reason,
  hint,
  seasonId,
  variant = "ghost",
}: {
  action: SyncAction;
  label: string;
  pendingLabel: string;
  reason: string;
  hint: string;
  seasonId: string;
  variant?: "primary" | "ghost";
}) {
  const [state, formAction, pending] = useActionState(action, ADMIN_IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="reason" value={reason} />
      <input type="hidden" name="seasonId" value={seasonId} />
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

export function SyncButtons({ seasons }: { seasons: SeasonChoice[] }) {
  const [seasonId, setSeasonId] = useState(
    seasons.find((s) => s.isActive)?.id ?? seasons[0]?.id ?? "",
  );

  return (
    <div className="flex flex-col gap-4">
      {seasons.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Compétition
          </span>
          <select
            value={seasonId}
            onChange={(e) => setSeasonId(e.target.value)}
            className="rounded-[14px] border border-line-strong bg-surface px-3 py-2.5 text-[15px] text-ink"
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.competition} — {s.label}
                {s.isActive ? " (active)" : ""}
              </option>
            ))}
          </select>
          <span className="text-[12px] leading-snug text-ink-faint">
            Éprouver la chaîne sur une compétition qui joue déjà vaut mieux que d&apos;attendre
            la première journée du Top 14.
          </span>
        </label>
      )}

      <SyncButton
        action={runCalendarSync}
        seasonId={seasonId}
        variant="primary"
        label="Synchroniser le calendrier"
        pendingLabel="Interrogation du fournisseur…"
        reason="Synchronisation du calendrier déclenchée depuis l'espace admin"
        hint="Matchs, horaires et journées. À lancer en premier."
      />
      <SyncButton
        action={runLiveSync}
        seasonId={seasonId}
        label="Relever les scores"
        pendingLabel="Relevé en cours…"
        reason="Relevé des scores déclenché depuis l'espace admin"
        hint="Forcé, même hors fenêtre de match."
      />
      <SyncButton
        action={runStandingsSync}
        seasonId={seasonId}
        label="Rafraîchir le classement sportif"
        pendingLabel="Rafraîchissement…"
        reason="Classement sportif rafraîchi depuis l'espace admin"
        hint="Le vrai classement du Top 14, pas celui des pronostiqueurs."
      />
    </div>
  );
}
