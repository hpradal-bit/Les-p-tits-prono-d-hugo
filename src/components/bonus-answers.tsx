"use client";

/**
 * « Qui a mis quoi » sur une question bonus terminée.
 *
 * Replié par défaut : sur un téléphone, six réponses dépliées d'office
 * repoussent tout le reste de l'écran. Un clic ouvre, un clic referme.
 *
 * Le composant ne décide jamais de la visibilité : c'est l'appelant qui ne
 * lui passe des réponses qu'une fois la question fermée (`answersArePublic`).
 */

import { useState } from "react";
import { cn } from "@/lib/cn";
import { getKind } from "@/lib/bonus/registry";
import type { BonusAnswerRow, BonusScoreRow, BonusResult } from "@/lib/bonus/types";

const OUTCOME_STYLE: Record<string, string> = {
  correct: "text-winner",
  partial: "text-clay",
  wrong: "text-wrong",
};

export interface BonusAnswersProps {
  kind: string;
  config: unknown;
  answers: BonusAnswerRow[];
  scores: BonusScoreRow[];
  result: BonusResult | null;
  namesById: Record<string, string>;
  viewerId: string | null;
  /** Ouvert d'emblée : l'écran Questions, où c'est le sujet de la page. */
  defaultOpen?: boolean;
}

export function BonusAnswers({
  kind,
  config,
  answers,
  scores,
  result,
  namesById,
  viewerId,
  defaultOpen = false,
}: BonusAnswersProps) {
  const [open, setOpen] = useState(defaultOpen);
  const kd = getKind(kind);
  if (!kd || answers.length === 0) return null;

  // Les meilleurs d'abord : la question terminée se lit comme un mini-classement.
  const pointsOf = (userId: string) => scores.find((s) => s.userId === userId)?.points ?? 0;
  const ordered = [...answers].sort(
    (a, b) =>
      pointsOf(b.userId) - pointsOf(a.userId) ||
      (namesById[a.userId] ?? "").localeCompare(namesById[b.userId] ?? "", "fr"),
  );

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 self-start rounded-full bg-surface-sunk px-2.5 py-1 font-mono text-[11px] font-semibold text-ink-muted transition hover:text-ink"
      >
        <span aria-hidden className={cn("transition-transform", open && "rotate-90")}>
          ▶
        </span>
        {open ? "Masquer les réponses" : `Voir les ${answers.length} réponses`}
      </button>

      {open && (
        <div className="flex flex-col divide-y divide-line rounded-xl border border-line bg-surface-sunk/40">
          {ordered.map((a) => {
            const score = scores.find((s) => s.userId === a.userId);
            return (
              <div
                key={a.userId}
                className="flex items-baseline justify-between gap-2 px-2.5 py-1.5"
              >
                <span
                  className={cn(
                    "text-[13px] leading-tight",
                    a.userId === viewerId ? "font-bold text-ink" : "text-ink-muted",
                  )}
                >
                  <span className="font-semibold text-ink">{namesById[a.userId] ?? "?"}</span>{" "}
                  — {kd.formatAnswer(a.answer, config)}
                </span>
                {score && (
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[12px] font-bold",
                      OUTCOME_STYLE[score.breakdown.outcome] ?? "text-ink-muted",
                    )}
                  >
                    {score.points > 0 ? `+${score.points}` : score.points}
                  </span>
                )}
              </div>
            );
          })}
          {result && (
            <p className="px-2.5 py-1.5 text-[12px] font-semibold text-perfect">
              Bonne réponse : {kd.formatCorrect(result.correctAnswer, config)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
