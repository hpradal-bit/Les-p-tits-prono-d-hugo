"use client";

import Link from "next/link";
import { useRef, useEffect } from "react";
import { cn } from "@/lib/cn";
import type { RoundSummary } from "@/lib/predictions/types";

export function RoundNav({
  rounds,
  currentNumber,
  leagueId,
  mode = "reload",
}: {
  rounds: RoundSummary[];
  currentNumber: number;
  /** Sans elle, changer de journée perdrait la ligue affichée. */
  leagueId: string;
  /**
   * `reload` (historique) : chaque pastille recharge `/journee?j=N`, en
   * changeant la journée « courante » de l'écran. `anchor` : toute la saison
   * est déjà sur la page (vue Top 14) — la pastille se contente de faire
   * défiler jusqu'au bandeau de cette journée, sans recharger ni changer
   * quelle journée est mise en évidence.
   */
  mode?: "reload" | "anchor";
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [currentNumber]);

  return (
    <div
      ref={scrollRef}
      className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 py-0.5"
    >
      {rounds.map((r) => {
        const active = r.number === currentNumber;
        return (
          <Link
            key={r.id}
            ref={active ? activeRef : undefined}
            href={mode === "anchor" ? `#round-${r.id}` : `/journee?league=${leagueId}&j=${r.number}`}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 font-mono text-[12px] font-semibold transition",
              active
                ? "bg-clay text-surface shadow-sm"
                : "border border-line bg-surface text-ink-muted hover:bg-surface-sunk",
              r.status === "settled" && !active && "text-ink-faint",
            )}
          >
            J{r.number}
          </Link>
        );
      })}
    </div>
  );
}
