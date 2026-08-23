"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { updatePoints } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";
import type { Ruleset } from "@/lib/types";
import { Feedback, numberInput, reasonInput } from "./shared";

const LEVELS = [
  {
    name: "wrong",
    label: "Mauvais vainqueur",
    hint: "Le prono s'est trompé de camp.",
    emoji: "❌",
  },
  {
    name: "winner",
    label: "Bon vainqueur",
    hint: "Le bon camp, mais pas la bonne tranche d'écart.",
    emoji: "✅",
  },
  {
    name: "winnerAndMargin",
    label: "Bon vainqueur + bonne tranche",
    hint: "Le bon camp et le bon écart.",
    emoji: "🎯",
  },
  {
    name: "exactScore",
    label: "Score exact",
    hint: "Les deux scores au point près.",
    emoji: "🏆",
  },
] as const;

/**
 * Les quatre valeurs de la cascade. Toute modification rejoue la saison :
 * le classement affiché est toujours celui du barème en vigueur.
 */
export function PointsForm({ ruleset }: { ruleset: Ruleset }) {
  const [state, action, pending] = useActionState(updatePoints, ADMIN_IDLE);
  const current: Record<string, number> = {
    wrong: ruleset.points.wrong,
    winner: ruleset.points.winner,
    winnerAndMargin: ruleset.points.winner_and_margin,
    exactScore: ruleset.points.exact_score,
  };

  return (
    <form action={action} className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {LEVELS.map((level) => (
          <li
            key={level.name}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface-sunk px-3 py-2.5"
          >
            <span aria-hidden className="text-lg">{level.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-semibold text-ink">{level.label}</span>
              <span className="block text-[12.5px] text-ink-muted">{level.hint}</span>
            </span>
            <input
              className={numberInput}
              type="number"
              name={level.name}
              min={0}
              max={999}
              required
              defaultValue={current[level.name]}
              aria-label={`Points — ${level.label}`}
            />
            <span className="text-[12.5px] text-ink-faint">pts</span>
          </li>
        ))}
      </ul>

      <p className="text-[12.5px] leading-relaxed text-ink-muted">
        La cascade doit rester croissante : viser plus précis ne peut jamais
        rapporter moins. Enregistrer relance le calcul de toute la saison.
      </p>

      <input
        name="reason"
        required
        minLength={3}
        placeholder="Raison (ex. : le score exact rapportait trop)"
        className={reasonInput}
      />

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Recalcul de la saison…" : "Enregistrer le barème"}
        </Button>
      </div>

      <Feedback state={state} />
    </form>
  );
}
