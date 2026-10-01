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
import { seasonRewardFor, seasonZoneFor, SEASON_ZONE_LABEL } from "@/lib/standings/season-rewards";

const ZONE_BORDER_CLASS: Record<"demi" | "barrages", string> = {
  demi: "border-l-winner",
  barrages: "border-l-clay",
};

const REWARD_TONE_CLASS: Record<"gain" | "due" | "neutral", string> = {
  gain: "border-winner/40 bg-winner-soft/60 text-winner",
  due: "border-wrong/40 bg-wrong-soft/60 text-wrong",
  neutral: "border-line bg-surface-sunk text-ink-faint",
};

export function StandingsList({
  rows,
  viewerId,
  clubs = [],
  livePreviewByUser,
  seasonRewards = false,
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
  /**
   * Règle maison de "Prono des copains" (gages de fin de saison + zones façon
   * Top 14) — n'affiche jamais rien ailleurs. Voir `lib/standings/season-rewards.ts`.
   */
  seasonRewards?: boolean;
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
          const zone = seasonRewards ? seasonZoneFor(row.position, rows.length) : null;
          const reward = seasonRewards ? seasonRewardFor(row.position, rows.length) : null;
          // La frontière de zone façon Top 14 (1-2 demi-finale, 3-6 barrages
          // pour une ligue à 6 joueurs) : un bandeau juste avant la première
          // ligne d'une nouvelle zone, jamais répété ensuite.
          const previousZone =
            seasonRewards && row.position > 1
              ? seasonZoneFor(row.position - 1, rows.length)
              : null;
          const isZoneStart = zone !== null && zone !== previousZone;
          return (
            <li key={row.player.userId}>
              {isZoneStart && zone && (
                <p className="bg-surface-sunk px-3.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint sm:px-4">
                  {SEASON_ZONE_LABEL[zone]}
                </p>
              )}
              <Link
                href={isViewer ? "/profil" : `/profil/${row.player.userId}`}
                className={cn(
                  "flex items-center gap-3 border-l-4 border-l-transparent px-3 py-3 transition hover:bg-surface-sunk sm:px-4",
                  isViewer && "bg-clay-soft/60",
                  zone && ZONE_BORDER_CLASS[zone],
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
                {reward && (
                  <span
                    className={cn(
                      "mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold leading-tight",
                      REWARD_TONE_CLASS[reward.tone],
                    )}
                  >
                    <span aria-hidden>{reward.emoji}</span>
                    {reward.label}
                  </span>
                )}
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
