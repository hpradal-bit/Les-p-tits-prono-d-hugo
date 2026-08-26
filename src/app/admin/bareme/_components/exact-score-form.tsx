"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { updateExactScoreQuota } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";
import type { Ruleset } from "@/lib/types";
import { Feedback, numberInput, textInput, reasonInput } from "./shared";
import { ScopePicker } from "./scope-picker";

const PERIODS = [
  { value: "match", label: "par match" },
  { value: "round", label: "par journée" },
  { value: "month", label: "par mois" },
  { value: "season", label: "par saison" },
];

/** Combien de scores exacts un joueur peut tenter, et sur quelle période. */
export function ExactScoreForm({ ruleset, leagueId }: { ruleset: Ruleset; leagueId: string }) {
  const [state, action, pending] = useActionState(updateExactScoreQuota, ADMIN_IDLE);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="leagueId" value={leagueId} />
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="quota" className="text-[14.5px] text-ink">
          Chaque joueur peut tenter
        </label>
        <input
          id="quota"
          className={numberInput}
          type="number"
          name="quota"
          min={0}
          max={99}
          defaultValue={ruleset.exactScore.quota ?? ""}
          placeholder="∞"
        />
        <select
          name="period"
          defaultValue={ruleset.exactScore.period}
          className={`${textInput} w-auto`}
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <p className="text-[12.5px] leading-relaxed text-ink-muted">
        Laisser le nombre vide pour un nombre illimité de tentatives. Zéro
        désactive complètement le score exact.
      </p>

      <ScopePicker />

      <input
        name="reason"
        required
        minLength={3}
        placeholder="Raison (ex. : une tentative par journée, c'était trop maigre)"
        className={reasonInput}
      />

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer le quota"}
        </Button>
      </div>

      <Feedback state={state} />
    </form>
  );
}
