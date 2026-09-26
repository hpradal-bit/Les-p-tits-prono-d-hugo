/**
 * Le classement, ligne à ligne : position, avatar, prénom, points, évolution,
 * taux de réussite et série en cours.
 */

import Link from "next/link";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui";
import { PlayerAvatar } from "../../_components/player-avatar";
import { Movement, RowStats } from "./bits";
import type { ClubAvatar } from "@/lib/auth/avatars";
import type { StandingsRow } from "@/lib/standings/engine";

export function StandingsList({
  rows,
  viewerId,
  clubs = [],
  livePreviewByUser,
}: {
  rows: StandingsRow[];
  viewerId: string | null;
  clubs?: readonly ClubAvatar[];
  /**
   * Points d'aperçu en direct déjà inclus dans `row.points`, par joueur — sert
   * seulement à afficher le détail (« dont +3 en direct »), jamais à les
   * recalculer. `undefined` ou objet vide : aucun calque en direct ici.
   */
  livePreviewByUser?: Record<string, number>;
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
            <li key={row.player.userId}>
              <Link
                href={isViewer ? "/profil" : `/profil/${row.player.userId}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 transition hover:bg-surface-sunk sm:px-4",
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

              <PlayerAvatar player={row.player} clubs={clubs} size={38} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">
                  {row.player.displayName}
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

              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="tabular w-12 text-right font-mono text-lg font-bold text-ink">
                  {row.points}
                </span>
                {!!livePreviewByUser?.[row.player.userId] && (
                  <span
                    className="tabular flex items-center gap-1 rounded-full border border-dashed border-live px-1.5 py-0.5 font-mono text-[10px] font-bold text-live"
                    title="Aperçu en direct, non officiel — se confirmera à la fin du match"
                  >
                    <span className="size-1.5 animate-pulse rounded-full bg-live" aria-hidden />
                    +{livePreviewByUser[row.player.userId]} live
                  </span>
                )}
              </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
