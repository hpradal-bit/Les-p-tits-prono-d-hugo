"use client";

/**
 * Sous un match terminé : qui avait parié quoi, pour combien, et le pouvoir
 * qui s'est joué là.
 *
 * Replié par défaut, et volontairement dense — sur un téléphone, six lignes
 * dépliées sous chacun des sept matchs d'une journée rendraient l'écran
 * interminable. Une ligne par joueur, jamais plus.
 *
 * Il vit à côté de la carte de match, pas dedans : la carte est un lien vers
 * le Match Center, et un bouton ne s'imbrique pas dans un lien.
 */

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { FixtureBreakdown } from "@/lib/predictions/breakdowns";
import type { ScoreLevel } from "@/lib/types";

const LEVEL_STYLE: Record<ScoreLevel, string> = {
  exact_score: "text-perfect",
  winner_and_margin: "text-winner",
  winner: "text-sage",
  wrong: "text-ink-faint",
};

export function MatchBreakdown({
  breakdown,
  viewerId,
}: {
  breakdown: FixtureBreakdown;
  viewerId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const { players, powers } = breakdown;
  if (players.length === 0 && powers.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 self-start rounded-full px-2 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint transition hover:text-ink-muted"
      >
        <span aria-hidden className={cn("transition-transform", open && "rotate-90")}>
          ▶
        </span>
        {open ? "Masquer" : "Les pronos du groupe"}
        {powers.length > 0 && <span aria-hidden>{powers.map((p) => p.emoji).join("")}</span>}
      </button>

      {open && (
        <div className="flex flex-col gap-1 rounded-2xl bg-surface-sunk/60 px-2.5 py-2">
          {players.map((p) => (
            <div key={p.userId} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[12px] leading-tight text-ink-muted">
                <span
                  className={cn(
                    "font-semibold",
                    p.userId === viewerId ? "text-clay" : "text-ink",
                  )}
                >
                  {p.name}
                </span>{" "}
                {p.label}
                {p.isAuto && <span title="Joué automatiquement au verrouillage"> 😴</span>}
              </span>
              <span
                className={cn(
                  "shrink-0 font-mono text-[12px] font-bold",
                  p.level ? LEVEL_STYLE[p.level] : "text-ink-faint",
                )}
              >
                {p.points === null ? "—" : `+${p.points}`}
              </span>
            </div>
          ))}

          {powers.length > 0 && (
            <div className="mt-0.5 flex flex-col gap-0.5 border-t border-line pt-1.5">
              {powers.map((power) => (
                <div
                  key={power.usageId}
                  className="flex items-baseline justify-between gap-2 text-[11.5px] leading-tight"
                >
                  <span className="min-w-0 truncate text-ink-muted">
                    <span aria-hidden>{power.emoji}</span>{" "}
                    <span className="font-semibold text-ink">{power.actorName}</span>{" "}
                    {power.powerName.toLowerCase()}
                    {power.targetName && (
                      <>
                        {" "}
                        sur <span className="font-semibold text-ink">{power.targetName}</span>
                      </>
                    )}
                  </span>
                  {/* Un zéro ne s'affiche pas : le Sabotage ne rapporte rien à
                      son auteur, l'Espion ne déplace aucun point. « +0 » en vert
                      laisserait croire à un gain nul plutôt qu'à l'absence
                      d'enjeu en points. */}
                  <span className="flex shrink-0 gap-1.5 font-mono font-bold">
                    {power.actorDelta !== 0 && (
                      <span className={power.actorDelta > 0 ? "text-winner" : "text-wrong"}>
                        {power.actorDelta > 0 ? "+" : ""}
                        {power.actorDelta}
                      </span>
                    )}
                    {power.targetDelta !== null && power.targetDelta !== 0 && (
                      <span className={power.targetDelta > 0 ? "text-winner" : "text-wrong"}>
                        {power.targetName} {power.targetDelta > 0 ? "+" : ""}
                        {power.targetDelta}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
