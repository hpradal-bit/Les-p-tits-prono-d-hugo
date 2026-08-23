"use client";

import { useState } from "react";
import { PlayerAvatar } from "../../_components/player-avatar";
import { ScorePill } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { MatchPrediction } from "@/lib/standings/queries";

/**
 * Une ligne de la révélation.
 *
 * Le pronostic est déjà lisible : le match est verrouillé, la base l'autorise.
 * Le flou et le bouton « Retourner » sont un rituel, pas une protection — on
 * découvre les cartes une par une, comme au poker. C'est ce petit geste qui
 * transforme une liste en moment.
 */
export function RevealRow({
  prediction,
  label,
  isMine,
  isAlone,
  startRevealed,
}: {
  prediction: MatchPrediction;
  label: string;
  isMine: boolean;
  isAlone: boolean;
  startRevealed: boolean;
}) {
  const [revealed, setRevealed] = useState(startRevealed);
  const score = prediction.score;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[28px] p-2.5 px-4 shadow-[var(--shadow-card)]",
        isMine ? "border border-clay/50 bg-surface" : "bg-surface",
        !revealed && "border border-dashed border-line-strong bg-surface-sunk shadow-none",
      )}
    >
      {revealed ? (
        <PlayerAvatar player={prediction.player} size={36} />
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-line text-[15px] font-bold text-ink-muted">
          ?
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[14px] font-bold text-ink">
          {prediction.player.firstName}
          {isMine && <span className="font-normal text-ink-faint"> · toi</span>}
        </span>
        <span
          className={cn(
            "truncate text-[12px] text-ink-muted",
            !revealed && "select-none blur-[4px]",
          )}
          aria-hidden={!revealed}
        >
          {label}
        </span>
      </div>

      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-[11px] font-bold text-ground active:scale-95"
        >
          Retourner
        </button>
      ) : score ? (
        <ScorePill level={score.level} points={score.points} />
      ) : prediction.exactHomeScore !== null ? (
        <span className="shrink-0 rounded-full bg-clay-soft px-2.5 py-1 text-[11px] font-bold text-clay">
          exact
        </span>
      ) : isMine ? (
        <span className="shrink-0 rounded-full bg-clay-soft px-2.5 py-1 text-[11px] font-bold text-clay">
          Ton prono
        </span>
      ) : isAlone ? (
        <span className="shrink-0 whitespace-nowrap text-[11px] text-ink-muted">
          contre le groupe
        </span>
      ) : null}
    </div>
  );
}
