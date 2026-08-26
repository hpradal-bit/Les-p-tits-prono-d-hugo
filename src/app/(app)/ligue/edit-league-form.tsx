"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { IDLE } from "@/lib/auth/action-state";
import { updateLeague, regenerateJoinKey } from "@/lib/leagues/actions.ts";
import type { League } from "@/lib/leagues/types.ts";

export function EditLeagueForm({ league }: { league: League }) {
  const [state, formAction, pending] = useActionState(updateLeague, IDLE);
  const [keyState, regenerateAction, regeneratePending] = useActionState(regenerateJoinKey, IDLE);

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="leagueId" value={league.id} />
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink">Nom</span>
          <input
            type="text"
            name="name"
            defaultValue={league.name}
            maxLength={80}
            className="rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-[15px] text-ink"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink">Logo (URL)</span>
          <input
            type="url"
            name="logoUrl"
            defaultValue={league.logoUrl ?? ""}
            className="rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-[15px] text-ink"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink">Slogan</span>
          <input
            type="text"
            name="slogan"
            defaultValue={league.slogan ?? ""}
            maxLength={140}
            className="rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-[15px] text-ink"
          />
        </label>
        {state.status !== "idle" && state.message && (
          <p
            role="status"
            className={`text-[13px] font-medium ${state.status === "success" ? "text-winner" : "text-wrong"}`}
          >
            {state.message}
          </p>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </form>

      <form action={regenerateAction}>
        <input type="hidden" name="leagueId" value={league.id} />
        <Button type="submit" variant="ghost" size="sm" disabled={regeneratePending}>
          {regeneratePending ? "Génération…" : "Régénérer la clé"}
        </Button>
        {keyState.status !== "idle" && keyState.message && (
          <p
            role="status"
            className={`mt-1.5 text-[12.5px] ${keyState.status === "success" ? "text-winner" : "text-wrong"}`}
          >
            {keyState.message}
          </p>
        )}
      </form>
    </div>
  );
}
