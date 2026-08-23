"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { updateVapidKey } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";

const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint";

/**
 * Saisie de la clé publique VAPID. Elle vit en base et se lit à l'exécution :
 * la changer ne demande aucun redéploiement.
 */
export function VapidForm({ currentKey }: { currentKey: string }) {
  const [state, action, pending] = useActionState(updateVapidKey, ADMIN_IDLE);

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="vapidKey" className="text-[13px] font-semibold text-ink">
          Clé publique
        </label>
        <textarea
          id="vapidKey"
          name="vapidKey"
          defaultValue={currentKey}
          required
          rows={3}
          spellCheck={false}
          placeholder="B…"
          className={`${field} min-h-20 break-all font-mono text-[12px] leading-relaxed`}
        />
        <p className="text-[12px] leading-snug text-ink-faint">
          87 caractères commençant par « B ». Elle va dans le navigateur des joueurs : c&apos;est
          normal, elle est publique. Sa jumelle privée, elle, reste dans la variable serveur
          <span className="font-mono"> VAPID_PRIVATE_KEY</span> et ne se colle jamais ici.
        </p>
      </div>

      <input
        name="reason"
        required
        minLength={3}
        defaultValue="Configuration des notifications"
        placeholder="Raison (ex. : première configuration des notifications)"
        className={field}
      />

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enregistrement…" : currentKey ? "Remplacer la clé" : "Enregistrer la clé"}
        </Button>
      </div>

      {state.status !== "idle" && state.message && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-[13.5px] ${
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
