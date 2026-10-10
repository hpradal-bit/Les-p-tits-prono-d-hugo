"use client";

/**
 * « Combien j'ai marqué, et qu'est-ce qui me l'a retiré » — demandé par
 * l'hôte en complément du bandeau Super-pouvoirs : celui-ci raconte CE QUI
 * s'est joué (qui, contre qui), celui-ci raconte CE QUE ÇA RAPPORTE, pour le
 * viewer seul, journée par journée.
 *
 * Repliée par défaut, même motif que `PowerDigestBanner` : le total reste
 * visible d'un coup d'œil, le détail (pronostics + chaque pouvoir) un tap
 * plus loin.
 */

import { useState } from "react";
import { cn } from "@/lib/cn";

export interface RoundPointsSummaryData {
  basePoints: number;
  powerItems: { code: string; emoji: string; name: string; delta: number }[];
  total: number;
}

function Delta({ value }: { value: number }) {
  return (
    <span
      className={cn(
        "tabular font-mono text-[13px] font-bold",
        value > 0 ? "text-winner" : value < 0 ? "text-wrong" : "text-ink-faint",
      )}
    >
      {value > 0 ? "+" : ""}
      {value}
    </span>
  );
}

export function RoundPointsSummary({ summary }: { summary: RoundPointsSummaryData }) {
  const [expanded, setExpanded] = useState(false);
  const { basePoints, powerItems, total } = summary;

  // Rien à montrer tant qu'aucun match n'est noté et qu'aucun pouvoir n'a
  // touché la journée — pas de carte vide sur une journée qui n'a pas commencé.
  if (basePoints === 0 && powerItems.length === 0) return null;

  return (
    <section className="rounded-2xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-[12.5px] font-bold text-ink">
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-clay-soft text-[13px]"
          >
            📊
          </span>
          Mon score sur cette journée
          <Delta value={total} />
        </span>
        <span aria-hidden className="shrink-0 text-[11px] text-ink-faint">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-1.5 px-3.5 pb-3.5 pt-1">
          <div className="flex items-center justify-between gap-2 text-[13px] text-ink-muted">
            <span>Pronostics marqués</span>
            <Delta value={basePoints} />
          </div>

          {powerItems.map((item) => (
            <div
              key={item.code}
              className="flex items-center justify-between gap-2 text-[13px] text-ink-muted"
            >
              <span>
                <span aria-hidden>{item.emoji}</span> {item.name}
              </span>
              <Delta value={item.delta} />
            </div>
          ))}

          <div className="mt-1 flex items-center justify-between gap-2 border-t border-line pt-1.5 text-[13.5px] font-bold text-ink">
            <span>Total</span>
            <Delta value={total} />
          </div>
        </div>
      )}
    </section>
  );
}
