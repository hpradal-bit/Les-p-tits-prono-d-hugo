/**
 * Le podium : les trois premiers, mis en scène. Deuxième à gauche, premier au
 * centre et surélevé, troisième à droite — comme sur un vrai podium.
 */

import { cn } from "@/lib/cn";
import { PlayerAvatar } from "../../_components/player-avatar";
import { Movement } from "./bits";
import type { StandingsRow } from "@/lib/standings/engine";

const MEDALS = ["🥇", "🥈", "🥉"];

function Step({ row, rank }: { row: StandingsRow; rank: number }) {
  const heights = ["h-24", "h-16", "h-12"];
  const isFirst = rank === 0;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
      <span className="text-xl" aria-hidden>
        {MEDALS[rank]}
      </span>
      <PlayerAvatar
        player={row.player}
        size={isFirst ? 60 : 46}
        className={cn(isFirst && "ring-2 ring-clay")}
      />
      <p className="max-w-full truncate text-center text-sm font-semibold text-ink">
        {row.player.firstName}
      </p>
      <Movement value={row.movement} />
      <div
        className={cn(
          "flex w-full flex-col items-center justify-center rounded-t-[12px] border border-b-0 border-line",
          isFirst ? "bg-clay-soft" : "bg-surface-sunk",
          heights[rank],
        )}
      >
        <span className="tabular font-mono text-lg font-bold text-ink">{row.points}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          {Math.abs(row.points) > 1 ? "pts" : "pt"}
        </span>
      </div>
    </div>
  );
}

export function Podium({ rows }: { rows: StandingsRow[] }) {
  const top3 = rows.slice(0, 3);
  if (top3.length < 3) return null;
  const [first, second, third] = top3;

  return (
    <section
      aria-label="Podium"
      className="flex items-end gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 pt-5 shadow-[var(--shadow-card)]"
    >
      <Step row={second} rank={1} />
      <Step row={first} rank={0} />
      <Step row={third} rank={2} />
    </section>
  );
}
