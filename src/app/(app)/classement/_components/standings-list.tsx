/**
 * Le classement, ligne à ligne : position, avatar, prénom, points, évolution,
 * taux de réussite et série en cours.
 */

import { cn } from "@/lib/cn";
import { Card } from "@/components/ui";
import { PlayerAvatar } from "../../_components/player-avatar";
import { Movement, RowStats } from "./bits";
import type { StandingsRow } from "@/lib/standings/engine";

export function StandingsList({
  rows,
  viewerId,
}: {
  rows: StandingsRow[];
  viewerId: string | null;
}) {
  if (rows.length === 0) {
    return (
      <Card className="p-5 text-sm text-ink-muted">
        Aucun joueur inscrit pour le moment.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <ol className="divide-y divide-line">
        {rows.map((row) => {
          const isViewer = row.player.userId === viewerId;
          return (
            <li
              key={row.player.userId}
              className={cn(
                "flex items-center gap-3 px-3 py-3 sm:px-4",
                isViewer && "bg-clay-soft/60",
              )}
            >
              <span
                className={cn(
                  "tabular w-6 shrink-0 text-center font-mono text-sm font-semibold",
                  row.position <= 3 ? "text-clay" : "text-ink-faint",
                )}
                aria-label={`Position ${row.position}`}
              >
                {row.position}
              </span>

              <PlayerAvatar player={row.player} size={38} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">
                  {row.player.firstName}
                  {isViewer && (
                    <span className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-clay">
                      toi
                    </span>
                  )}
                </p>
                <RowStats row={row} />
              </div>

              <div className="flex w-8 shrink-0 justify-center">
                <Movement value={row.movement} />
              </div>

              <span className="tabular w-12 shrink-0 text-right font-mono text-lg font-bold text-ink">
                {row.points}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
