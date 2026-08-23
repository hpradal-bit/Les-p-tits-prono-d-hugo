"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { updateNotificationRules } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";
import type { NotificationRules } from "@/lib/push/rules";

const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint";

/**
 * Les garde-fous du groupe.
 *
 * Ces trois réglages décident si les notifications survivent à la troisième
 * journée : une de trop et le joueur coupe tout, définitivement. D'où
 * l'interrupteur général en tête — couper proprement vaut mieux que voir
 * chacun couper dans son coin.
 */
export function RulesForm({ rules }: { rules: NotificationRules }) {
  const [state, action, pending] = useActionState(updateNotificationRules, ADMIN_IDLE);
  const [enabled, setEnabled] = useState(rules.enabled);
  const [from, setFrom] = useState(rules.quietFrom);
  const [to, setTo] = useState(rules.quietTo);

  const noQuiet = from === to;

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="mt-0.5 size-4 accent-clay"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-[14px] font-semibold text-ink">
            Notifications actives pour le groupe
          </span>
          <span className="text-[12.5px] leading-snug text-ink-faint">
            Décoché, plus rien ne part — pas même une annonce. Les abonnements des joueurs sont
            conservés : rallumer suffit à tout remettre en route.
          </span>
        </span>
      </label>

      <div className={`flex flex-col gap-4 ${enabled ? "" : "opacity-45"}`}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="maxPerDay" className="text-[13px] font-semibold text-ink">
            Messages par jour et par joueur
          </label>
          <input
            id="maxPerDay"
            name="maxPerDay"
            type="number"
            min={1}
            max={20}
            required
            defaultValue={rules.maxPerDay}
            className={`${field} w-24 text-center font-mono tabular`}
          />
          <p className="text-[12px] leading-snug text-ink-faint">
            Le plafond bride les messages automatiques. Une annonce écrite à la main passe outre —
            elle est rare et voulue.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-ink">Heures de silence</span>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="quietFrom" className="text-[13px] text-ink-muted">de</label>
            <input
              id="quietFrom" name="quietFrom" type="time" required
              value={from} onChange={(e) => setFrom(e.target.value)}
              className={`${field} w-32 font-mono tabular`}
            />
            <label htmlFor="quietTo" className="text-[13px] text-ink-muted">à</label>
            <input
              id="quietTo" name="quietTo" type="time" required
              value={to} onChange={(e) => setTo(e.target.value)}
              className={`${field} w-32 font-mono tabular`}
            />
          </div>
          <p className="text-[12px] leading-snug text-ink-faint">
            {noQuiet
              ? "Deux heures identiques : aucune heure de silence, les messages partent à toute heure."
              : "Ce qui tombe dans cette plage est reporté à la fin, jamais supprimé. Mets deux fois la même heure pour désactiver le silence."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="timeZone" className="text-[13px] font-semibold text-ink">
            Fuseau horaire
          </label>
          <input
            id="timeZone" name="timeZone" required
            defaultValue={rules.timeZone}
            placeholder="Europe/Paris"
            className={`${field} font-mono text-[13px]`}
          />
          <p className="text-[12px] text-ink-faint">
            Il décide de ce qu&apos;est « 22 h » et de quand commence un nouveau jour pour le plafond.
          </p>
        </div>
      </div>

      <input
        name="reason"
        required
        minLength={3}
        defaultValue="Ajustement des règles de notification"
        placeholder="Raison (elle apparaît au journal)"
        className={field}
      />

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer les règles"}
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
