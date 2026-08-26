"use client";

import Link from "next/link";
import { useRef, useEffect } from "react";
import { cn } from "@/lib/cn";
import type { RoundSummary } from "@/lib/predictions/types";

export function RoundNav({
  rounds,
  currentNumber,
  competitionCode,
}: {
  rounds: RoundSummary[];
  currentNumber: number;
  /** Sans elle, changer de journée renverrait vers le Top 14. */
  competitionCode: string;
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
            href={`/journee?ligue=${competitionCode}&j=${r.number}`}
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
