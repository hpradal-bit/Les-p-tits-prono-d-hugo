"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { updateVapidKey } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";

export function VapidForm({ currentKey }: { currentKey: string }) {
  const [state, action, pending] = useActionState(updateVapidKey, ADMIN_IDLE);

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <label htmlFor="vapidKey" className="text-[13px] font-semibold text-ink">
          Clé publique VAPID
        </label>
        <textarea
          id="vapidKey"
          name="vapidKey"
          defaultValue={currentKey}
          placeholder="ey..."
          className="min-h-24 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-[12px] text-ink placeholder:text-ink-faint"
        />
        <p className="text-[12px] text-ink-faint">
          Accessible publiquement. Copie-la depuis ta plateforme d&apos;envoi de notifications (ex. Mailgun, Firebase).
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>

      {state.status !== "idle" && state.message && (
        <p
          className={`rounded-lg px-3 py-2 text-[13px] ${
            state.status === "success"
              ? "bg-winner-soft text-winner"
              : "bg-wrong-soft text-wrong"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
