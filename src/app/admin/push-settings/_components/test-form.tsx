"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { sendTestNotification } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";

/**
 * Le bouton qui répond à « est-ce que ça marche vraiment ? ».
 *
 * L'envoi est immédiat et ne concerne que l'administrateur : c'est un
 * diagnostic, pas un message. En cas d'échec, on affiche ce que le service de
 * push a répondu — sans ça, il n'y a rien à corriger.
 */
export function TestForm({ ready }: { ready: boolean }) {
  const [state, action, pending] = useActionState(sendTestNotification, ADMIN_IDLE);

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="ghost" disabled={pending || !ready}>
          {pending ? "Envoi…" : "M'envoyer une notification de test"}
        </Button>
        {!ready && (
          <span className="text-[12px] text-ink-faint">Renseigne d&apos;abord les deux clés.</span>
        )}
      </div>

      {state.status !== "idle" && state.message && (
        <div
          role="status"
          className={`flex flex-col gap-1 rounded-lg px-3 py-2 text-[13.5px] ${
            state.status === "success" ? "bg-winner-soft text-winner" : "bg-wrong-soft text-wrong"
          }`}
        >
          <span>{state.message}</span>
          {state.details?.map((d) => (
            <span key={d} className="font-mono text-[11.5px] leading-snug opacity-80">
              {d}
            </span>
          ))}
        </div>
      )}
    </form>
  );
}
