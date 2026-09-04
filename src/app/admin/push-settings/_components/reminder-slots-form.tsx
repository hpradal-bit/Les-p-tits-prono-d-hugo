"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { updateLockReminderSlots } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";
import type { ReminderSlot } from "@/lib/push/lock-reminder-settings";

const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint";

/**
 * Un créneau : coche + délai + texte. Les deux créneaux sont fixes (pas une
 * liste ouverte — c'est exactement ce qu'Hugo a demandé), affichés côte à
 * côte dans le même formulaire, enregistrés ensemble.
 */
function SlotFields({
  index,
  slot,
}: {
  index: 1 | 2;
  slot: ReminderSlot;
}) {
  const [enabled, setEnabled] = useState(slot.enabled);
  const prefix = `slot${index}`;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-3.5">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name={`${prefix}Enabled`}
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 size-4 accent-clay"
        />
        <span className="text-[13.5px] font-semibold text-ink">Créneau {index}</span>
      </label>

      <div className={`flex flex-col gap-3 ${enabled ? "" : "opacity-45"}`}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${prefix}HoursBefore`} className="text-[12.5px] font-semibold text-ink">
            Délai avant la fermeture du match
          </label>
          <div className="flex items-center gap-2">
            <input
              id={`${prefix}HoursBefore`}
              name={`${prefix}HoursBefore`}
              type="number"
              min={1}
              max={72}
              required
              defaultValue={slot.hoursBefore}
              className={`${field} w-24 text-center font-mono tabular`}
            />
            <span className="text-[13px] text-ink-muted">heure(s) avant</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${prefix}Title`} className="text-[12.5px] font-semibold text-ink">
            Titre
          </label>
          <input
            id={`${prefix}Title`}
            name={`${prefix}Title`}
            type="text"
            required={enabled}
            maxLength={100}
            defaultValue={slot.title}
            className={field}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${prefix}Body`} className="text-[12.5px] font-semibold text-ink">
            Texte
          </label>
          <textarea
            id={`${prefix}Body`}
            name={`${prefix}Body`}
            required={enabled}
            maxLength={300}
            rows={2}
            defaultValue={slot.body}
            className={field}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Les deux rappels avant verrouillage. Enregistrés une fois, appliqués
 * automatiquement à chaque match ensuite — rien à reprogrammer.
 */
export function ReminderSlotsForm({ slots }: { slots: [ReminderSlot, ReminderSlot] }) {
  const [state, action, pending] = useActionState(updateLockReminderSlots, ADMIN_IDLE);

  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-[12px] leading-snug text-ink-faint">
        Dans le titre et le texte, <span className="font-mono">{"{journee}"}</span> devient le nom de la
        journée, <span className="font-mono">{"{heures}"}</span> le délai de ce créneau, et{" "}
        <span className="font-mono">{"{restant}"}</span> le nombre de pronostics qu&apos;il reste à jouer
        pour le joueur qui reçoit le message.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <SlotFields index={1} slot={slots[0]} />
        <SlotFields index={2} slot={slots[1]} />
      </div>

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer les rappels"}
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
