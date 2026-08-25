"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { settleRoundAction } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";

export function SettleForm({ roundId, disabled }: { roundId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(settleRoundAction, ADMIN_IDLE);

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="roundId" value={roundId} />
      <Button type="submit" size="sm" disabled={pending || disabled}>
        {pending ? "Clôture…" : "Clôturer la journée"}
      </Button>
      {state.status !== "idle" && state.message && (
        <p className={`text-[13px] ${state.status === "success" ? "text-winner" : "text-wrong"}`}>
          {state.message}
        </p>
      )}
      {state.status === "success" && state.details && (
        <ul className="text-[12px] text-ink-muted">
          {state.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
