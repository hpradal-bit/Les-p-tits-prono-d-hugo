"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { updateLockDelay } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";
import type { Ruleset } from "@/lib/types";
import { Feedback, numberInput, reasonInput } from "./shared";

const PRESETS = [
  { minutes: 0, label: "Au coup d'envoi" },
  { minutes: 60, label: "1 h avant" },
  { minutes: 120, label: "2 h avant" },
  { minutes: 1440, label: "La veille" },
];

/** Combien de temps avant le coup d'envoi les pronostics se ferment. */
export function LockForm({ ruleset, leagueId }: { ruleset: Ruleset; leagueId: string }) {
  const [state, action, pending] = useActionState(updateLockDelay, ADMIN_IDLE);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="leagueId" value={leagueId} />
      <div className="flex items-center gap-3">
        <label
          htmlFor="minutesBeforeKickoff"
          className="min-w-0 flex-1 text-[14.5px] text-ink"
        >
          Les pronostics se ferment
        </label>
        <input
          id="minutesBeforeKickoff"
          className={numberInput}
          type="number"
          name="minutesBeforeKickoff"
          min={0}
          max={10080}
          required
          defaultValue={ruleset.lock.minutesBeforeKickoff}
        />
        <span className="text-[12.5px] text-ink-faint">min avant</span>
      </div>

      <p className="text-[12.5px] leading-relaxed text-ink-muted">
        Repères :{" "}
        {PRESETS.map((p) => `${p.label} = ${p.minutes} min`).join(" · ")}. Les
        matchs à venir sont reprogrammés aussitôt ; un match déjà verrouillé ne
        se rouvre jamais.
      </p>

      <input
        name="reason"
        required
        minLength={3}
        placeholder="Raison (ex. : trop juste pour ceux qui bossent le samedi)"
        className={reasonInput}
      />

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Reprogrammation…" : "Enregistrer le délai"}
        </Button>
      </div>

      <Feedback state={state} />
    </form>
  );
}
