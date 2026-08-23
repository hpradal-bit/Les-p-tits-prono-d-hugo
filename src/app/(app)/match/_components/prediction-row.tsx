/**
 * Ce qu'un joueur avait pronostiqué, les points obtenus, et pourquoi.
 * La raison vient du champ `breakdown` de `prediction_scores` : c'est la
 * transparence du scoring qui évite les disputes.
 */

import { ScorePill } from "@/components/ui";
import { cn } from "@/lib/cn";
import { PlayerAvatar } from "../../_components/player-avatar";
import { predictionSummary } from "@/lib/standings/format";
import type { MatchFixture, MatchPrediction } from "@/lib/standings/queries";

export function PredictionRow({
  prediction,
  fixture,
  isViewer,
}: {
  prediction: MatchPrediction;
  fixture: MatchFixture;
  isViewer: boolean;
}) {
  return (
    <li className={cn("flex gap-3 px-3 py-3 sm:px-4", isViewer && "bg-clay-soft/60")}>
      <PlayerAvatar player={prediction.player} size={38} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[15px] font-semibold text-ink">
            {prediction.player.firstName}
            {isViewer && (
              <span className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-clay">
                toi
              </span>
            )}
          </p>
          {prediction.score ? (
            <ScorePill level={prediction.score.level} points={prediction.score.points} />
          ) : (
            <span className="shrink-0 font-mono text-[11px] text-ink-faint">
              en attente du résultat
            </span>
          )}
        </div>

        <p className="mt-0.5 text-[13px] text-ink-muted">
          {predictionSummary(prediction, fixture.homeTeam, fixture.awayTeam)}
        </p>

        {prediction.score && (
          <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">
            {prediction.score.reason}
          </p>
        )}

        {prediction.isAuto && (
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-sage">
            😴 pronostic automatique
          </p>
        )}
      </div>
    </li>
  );
}
