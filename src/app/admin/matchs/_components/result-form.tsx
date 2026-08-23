"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { recordResult, clearResult } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";
import type { AdminFixture } from "@/lib/admin/queries";

const input =
  "w-16 rounded-lg border border-line bg-surface px-2 py-2 text-center font-mono text-lg " +
  "tabular text-ink focus-visible:border-clay";

/** Saisie d'un résultat. Le filet de sécurité quand l'API ne répond plus. */
export function ResultForm({ fixture }: { fixture: AdminFixture }) {
  const [state, action, pending] = useActionState(recordResult, ADMIN_IDLE);
  const [clearState, clearAction, clearing] = useActionState(clearResult, ADMIN_IDLE);
  const hasResult = fixture.homeScore !== null;
  const feedback = state.status !== "idle" ? state : clearState;

  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="fixtureId" value={fixture.id} />

        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-right text-[15px] font-semibold text-ink">
            {fixture.homeName}
          </span>
          <input
            className={input} name="homeScore" type="number" min={0} max={200} required
            defaultValue={fixture.homeScore ?? ""} aria-label={`Score ${fixture.homeName}`}
          />
          <span className="font-mono text-ink-faint">–</span>
          <input
            className={input} name="awayScore" type="number" min={0} max={200} required
            defaultValue={fixture.awayScore ?? ""} aria-label={`Score ${fixture.awayName}`}
          />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
            {fixture.awayName}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            <input type="radio" name="status" value="finished" defaultChecked={fixture.status !== "official"} />
            Terminé
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            <input type="radio" name="status" value="official" defaultChecked={fixture.status === "official"} />
            Officiel
          </label>
        </div>

        <input
          name="reason" required minLength={3}
          placeholder="Raison (ex. : score relevé sur le site de la LNR)"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint"
        />

        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Enregistrement…" : hasResult ? "Corriger le résultat" : "Enregistrer le résultat"}
          </Button>
          {hasResult && (
            <Button
              type="submit" size="sm" variant="ghost" disabled={clearing}
              formAction={clearAction}
            >
              {clearing ? "Annulation…" : "Annuler le résultat"}
            </Button>
          )}
        </div>
      </form>

      {feedback.status !== "idle" && feedback.message && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-[13.5px] ${
            feedback.status === "success"
              ? "bg-winner-soft text-winner"
              : "bg-wrong-soft text-wrong"
          }`}
        >
          {feedback.message}
        </p>
      )}
    </div>
  );
}
