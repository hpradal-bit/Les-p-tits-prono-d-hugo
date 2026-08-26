"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { updateMarginBucket } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";
import type { MarginBucket } from "@/lib/types";
import { Feedback, numberInput, textInput, reasonInput } from "./shared";
import { ScopePicker } from "./scope-picker";

/** Une tranche d'écart : son intitulé et ses deux bornes. */
export function BucketForm({ bucket, leagueId }: { bucket: MarginBucket; leagueId: string }) {
  const [state, action, pending] = useActionState(updateMarginBucket, ADMIN_IDLE);

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-line bg-surface-sunk p-3">
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="bucketId" value={bucket.id} />

      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${textInput} min-w-0 flex-1`}
          name="label"
          maxLength={40}
          required
          defaultValue={bucket.label}
          aria-label="Intitulé de la tranche"
        />
        <input
          className={numberInput}
          type="number"
          name="minPoints"
          min={0}
          max={200}
          required
          defaultValue={bucket.minPoints}
          aria-label="Écart minimum"
        />
        <span className="font-mono text-ink-faint">→</span>
        <input
          className={numberInput}
          type="number"
          name="maxPoints"
          min={0}
          max={200}
          defaultValue={bucket.maxPoints ?? ""}
          placeholder="∞"
          aria-label="Écart maximum"
        />
      </div>


      <div className="flex flex-wrap items-center gap-2">
        <input
          name="reason"
          required
          minLength={3}
          placeholder="Raison"
          className={`${reasonInput} min-w-0 flex-1`}
        />
        <ScopePicker compact />
        <Button type="submit" size="sm" variant="ghost" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>

      <Feedback state={state} />
    </form>
  );
}
