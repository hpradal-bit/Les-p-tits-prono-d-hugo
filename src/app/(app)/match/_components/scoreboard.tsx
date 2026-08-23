/**
 * Le tableau d'affichage du match : équipes, score, statut.
 */

import { Card, LiveBadge, TeamLogo } from "@/components/ui";
import { cn } from "@/lib/cn";
import { FIXTURE_STATUS_LABEL, formatKickoff, hasResult } from "@/lib/standings/format";
import type { MatchFixture } from "@/lib/standings/queries";

export function Scoreboard({ fixture }: { fixture: MatchFixture }) {
  const played = hasResult(fixture.status, fixture.homeScore);
  const homeWins = played && (fixture.homeScore ?? 0) > (fixture.awayScore ?? 0);
  const awayWins = played && (fixture.awayScore ?? 0) > (fixture.homeScore ?? 0);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          {fixture.roundName}
          {fixture.venue ? ` · ${fixture.venue}` : ""}
        </p>
        {fixture.status === "live" ? (
          <LiveBadge />
        ) : (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
              fixture.status === "official"
                ? "bg-clay-soft text-clay"
                : "bg-surface-sunk text-ink-muted",
            )}
          >
            {FIXTURE_STATUS_LABEL[fixture.status]}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <TeamSide team={fixture.homeTeam} winner={homeWins} />
        <div className="flex shrink-0 flex-col items-center">
          {played ? (
            <p className="tabular font-mono text-3xl font-bold text-ink">
              {fixture.homeScore}
              <span className="mx-1 text-ink-faint">–</span>
              {fixture.awayScore}
            </p>
          ) : (
            <p className="font-mono text-sm font-semibold text-ink-faint">vs</p>
          )}
          {fixture.status === "live" && fixture.minute !== null && (
            <p className="tabular font-mono text-[11px] font-semibold text-live">
              {fixture.minute}&apos;
            </p>
          )}
        </div>
        <TeamSide team={fixture.awayTeam} winner={awayWins} align="right" />
      </div>

      <div className="flex flex-col gap-1 border-t border-line pt-3">
        <p className="font-mono text-[11px] text-ink-muted">
          {formatKickoff(fixture.kickoffAt)}
        </p>
        {!fixture.kickoffConfirmed && (
          <p className="font-mono text-[11px] text-sage">
            ⚠️ Horaire provisoire : la LNR n&apos;a pas encore publié le jour et l&apos;heure.
          </p>
        )}
      </div>
    </Card>
  );
}

function TeamSide({
  team,
  winner,
  align = "left",
}: {
  team: MatchFixture["homeTeam"];
  winner: boolean;
  align?: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2.5",
        align === "right" && "flex-row-reverse",
      )}
    >
      <TeamLogo team={team} size={40} />
      <p
        className={cn(
          "min-w-0 flex-1 truncate font-display text-base leading-tight",
          align === "right" && "text-right",
          winner ? "font-extrabold text-ink" : "font-semibold text-ink-muted",
        )}
      >
        {team.shortName}
      </p>
    </div>
  );
}
