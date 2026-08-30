"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { revertAdjustment } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";
import { Feedback } from "../../bareme/_components/shared";

/** Annule un ajustement par son inverse. La ligne d'origine reste en base. */
export function RevertForm({ adjustmentId }: { adjustmentId: string }) {
  const [state, action, pending] = useActionState(revertAdjustment, ADMIN_IDLE);

  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="adjustmentId" value={adjustmentId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? "Annulation…" : "Annuler"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}
