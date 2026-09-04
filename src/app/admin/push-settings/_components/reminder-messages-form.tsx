"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { updateLockReminderMessages } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";
import type { ReminderMessage } from "@/lib/push/lock-reminder-settings";

const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-faint";

interface Draft {
  title: string;
  body: string;
}

/**
 * Le pot commun de messages tirés au hasard pour les rappels avant
 * verrouillage — une liste de taille variable (une vingtaine typiquement),
 * donc éditée en JSON dans un champ caché plutôt qu'en champs nommés fixes
 * comme les deux créneaux (dont le nombre, lui, est figé à deux).
 */
export function ReminderMessagesForm({ messages }: { messages: ReminderMessage[] }) {
  const [state, action, pending] = useActionState(updateLockReminderMessages, ADMIN_IDLE);
  const [drafts, setDrafts] = useState<Draft[]>(
    messages.map((m) => ({ title: m.title, body: m.body })),
  );

  function update(index: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function remove(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  function add() {
    setDrafts((prev) => [...prev, { title: "", body: "" }]);
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="messages" value={JSON.stringify(drafts)} />

      {drafts.length === 0 && (
        <p className="rounded-lg bg-surface-sunk px-3 py-2 text-[13px] text-ink-faint">
          Aucun message dans le pot : chaque créneau utilise son propre titre/texte fixe.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {drafts.map((d, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Message {i + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-[12px] font-semibold text-wrong"
              >
                Supprimer
              </button>
            </div>
            <input
              type="text"
              placeholder="Titre"
              maxLength={100}
              value={d.title}
              onChange={(e) => update(i, { title: e.target.value })}
              className={field}
            />
            <textarea
              placeholder="Texte"
              maxLength={300}
              rows={2}
              value={d.body}
              onChange={(e) => update(i, { body: e.target.value })}
              className={field}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={add}
          className="text-[13px] font-semibold text-clay"
        >
          + Ajouter un message
        </button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer les messages"}
        </Button>
      </div>

      {state.status !== "idle" && state.message && (
        <p
          role="status"
          className={`rounded-lg px-3 py-2 text-[13.5px] ${
            state.status === "success" ? "bg-winner-soft text-winner" : "bg-wrong-soft text-wrong"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
