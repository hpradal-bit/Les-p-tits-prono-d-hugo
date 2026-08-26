"use client";

import { useActionState, useState } from "react";
import {
  saveNotificationPreferences,
  PREFERENCES_IDLE,
} from "@/lib/push/preferences-actions";
import type { EffectivePreference } from "@/lib/push/preferences";

/**
 * Le choix, type par type, de ce qu'on veut recevoir.
 *
 * Les interrupteurs sont des cases à cocher natives, stylées : elles restent
 * accessibles au clavier et fonctionnent même si le JavaScript n'a pas fini de
 * charger — le formulaire se poste alors normalement.
 *
 * Un type « bientôt » (non branché) s'affiche grisé et sans interrupteur :
 * proposer de régler ce qui n'émet rien serait une fausse promesse.
 */
export function NotificationTypesForm({ items }: { items: EffectivePreference[] }) {
  const [state, formAction, pending] = useActionState(
    saveNotificationPreferences,
    PREFERENCES_IDLE,
  );

  const settable = items.filter((i) => i.wired);
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(settable.map((i) => [i.kind, i.enabled])),
  );

  const coupes = settable.filter((i) => checked[i.kind] === false).length;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li
            key={item.kind}
            className={`flex items-start gap-3 ${item.wired ? "" : "opacity-45"}`}
          >
            <span className="text-[16px]" aria-hidden>
              {item.emoji}
            </span>
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-[14px] font-semibold text-ink">
                {item.label}
                {!item.wired && (
                  <span className="ml-2 rounded-full bg-surface-sunk px-2 py-0.5 font-mono text-[10px] font-normal text-ink-faint">
                    bientôt
                  </span>
                )}
              </span>
              <span className="text-[12px] leading-snug text-ink-faint">
                {item.description}
              </span>
            </div>

            {item.wired && (
              <>
                {/* Le type est déclaré même décoché : c'est ce qui permet au
                    serveur d'écrire un « non » explicite plutôt que d'oublier
                    la ligne — sinon couper un type ne se distinguerait pas de
                    ne l'avoir jamais réglé. */}
                <input type="hidden" name="kind" value={item.kind} />
                <label className="relative mt-0.5 inline-flex shrink-0 cursor-pointer items-center">
                  <input
                    type="checkbox"
                    name="enabled"
                    value={item.kind}
                    checked={checked[item.kind] ?? true}
                    onChange={(e) =>
                      setChecked((c) => ({ ...c, [item.kind]: e.target.checked }))
                    }
                    className="peer sr-only"
                  />
                  <span className="sr-only">{item.label}</span>
                  <span className="h-6 w-10 rounded-full bg-line-strong transition peer-checked:bg-sage peer-focus-visible:ring-2 peer-focus-visible:ring-clay peer-focus-visible:ring-offset-2" />
                  <span className="pointer-events-none absolute left-0.5 size-5 rounded-full bg-surface shadow-[var(--shadow-card)] transition peer-checked:translate-x-4" />
                </label>
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-clay px-4 py-2 text-[14px] font-bold text-surface transition disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <span className="text-[12px] text-ink-faint">
          {coupes === 0
            ? "Tu reçois tout."
            : `${coupes} type${coupes > 1 ? "s" : ""} coupé${coupes > 1 ? "s" : ""}.`}
        </span>
      </div>

      {state.status !== "idle" && state.message && (
        <p
          role="status"
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
