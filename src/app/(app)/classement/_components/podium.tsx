/**
 * Le podium : les trois premiers, mis en scène. Deuxième à gauche, premier au
 * centre et surélevé, troisième à droite — comme sur un vrai podium.
 */

import { cn } from "@/lib/cn";
import { PlayerAvatar } from "../../_components/player-avatar";
import type { StandingsRow } from "@/lib/standings/engine";

const MEDALS = ["👑", "", ""];

function Step({ row, rank }: { row: StandingsRow; rank: number }) {
  // Marches de la maquette : 46 / 30 / 22 px, le premier dominant nettement.
  const heights = ["h-[46px]", "h-[30px]", "h-[22px]"];
  const widths = ["w-[72px]", "w-[64px]", "w-[60px]"];
  const isFirst = rank === 0;
  return (
    <div className="flex min-w-0 flex-col items-center justify-end gap-1.5">
      {MEDALS[rank] && (
        <span className="text-[15px]" aria-hidden>
          {MEDALS[rank]}
        </span>
      )}
      <PlayerAvatar
        player={row.player}
        size={isFirst ? 60 : 46}
        className={cn(isFirst && "ring-2 ring-clay-soft")}
      />
      <p className={cn(
        "max-w-full truncate text-center font-semibold text-surface",
        isFirst ? "text-[13px] font-bold" : "text-[12px]",
      )}>
        {row.player.firstName}
      </p>
      <div
        className={cn(
          "flex flex-col items-center justify-start rounded-t-[12px] pt-1 font-bold text-surface",
          isFirst ? "bg-clay" : "bg-sage-soft/25",
          heights[rank], widths[rank],
        )}
      >
        <span className="tabular text-[15px] leading-none">{row.points}</span>
      </div>
    </div>
  );
}

export function Podium({ rows }: { rows: StandingsRow[] }) {
  const top3 = rows.slice(0, 3);
  if (top3.length < 3) return null;
  const [first, second, third] = top3;

  return (
    <section aria-label="Podium" className="flex items-end justify-center gap-3.5">
      <Step row={second} rank={1} />
      <Step row={first} rank={0} />
      <Step row={third} rank={2} />
    </section>
  );
}
