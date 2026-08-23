"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { recomputeRoundAction } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";

/** Relance le calcul d'une journée entière. Rejouable sans risque. */
export function RecomputeForm({ roundId }: { roundId: string }) {
  const [state, action, pending] = useActionState(recomputeRoundAction, ADMIN_IDLE);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="roundId" value={roundId} />
      <input type="hidden" name="reason" value="Recalcul manuel depuis l'espace admin" />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? "Recalcul…" : "Recalculer toute la journée"}
      </Button>
      {state.status !== "idle" && state.message && (
        <p className={`text-[13px] ${state.status === "success" ? "text-winner" : "text-wrong"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
