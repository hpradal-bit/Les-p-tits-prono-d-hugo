/**
 * Les matchs d'une journée, en passerelle vers le Match Center.
 */

import Link from "next/link";
import { Card, LiveBadge, TeamLogo } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatShortKickoff, hasResult } from "@/lib/standings/format";
import type { RoundFixture } from "@/lib/standings/queries";

export function RoundFixtures({ fixtures }: { fixtures: RoundFixture[] }) {
  if (fixtures.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line">
        {fixtures.map((fixture) => {
          const played = hasResult(fixture.status, fixture.homeScore);
          return (
            <li key={fixture.id}>
              <Link
                href={`/match/${fixture.id}`}
                className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-surface-sunk sm:px-4"
              >
                <TeamLogo team={fixture.homeTeam} size={24} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                  {fixture.homeTeam.shortName}
                  <span className="text-ink-faint"> — </span>
                  {fixture.awayTeam.shortName}
                </span>
                <TeamLogo team={fixture.awayTeam} size={24} />
                {fixture.status === "live" && <LiveBadge />}
                <span
                  className={cn(
                    "tabular shrink-0 text-right font-mono",
                    played
                      ? "w-14 text-sm font-semibold text-ink"
                      : "w-28 text-[11px] text-ink-faint",
                  )}
                >
                  {played
                    ? `${fixture.homeScore}-${fixture.awayScore}`
                    : formatShortKickoff(fixture.kickoffAt)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
