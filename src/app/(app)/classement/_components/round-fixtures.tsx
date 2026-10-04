/**
 * Les matchs d'une journée, en passerelle vers le Match Center.
 *
 * Pour un match joué, une rangée de pastilles sous la ligne du match résume
 * "qui a marqué quoi sur CE match" — demande explicite d'Hugo, qui a d'abord
 * essayé une version à initiales ("M en dessous, C en dessous...") jugée
 * illisible ("on comprend pas qui c'est") : le vrai nom de chacun, en entier,
 * dans une pastille colorée plutôt qu'une lettre seule. Les points viennent
 * de `loadFixtureBreakdowns` (même lecture que `/journee` et `/resultats`),
 * jamais recalculés ici.
 */

import Link from "next/link";
import { Card, LiveBadge, TeamLogo } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatShortKickoff, hasResult, isInProgress, liveBadgeLabel } from "@/lib/standings/format";
import type { RoundFixture } from "@/lib/standings/queries";
import type { FixtureBreakdown } from "@/lib/predictions/breakdowns";
import type { ScoreLevel } from "@/lib/types";

const LEVEL_PILL: Record<ScoreLevel, string> = {
  exact_score: "bg-perfect-soft text-perfect",
  winner_and_margin: "bg-winner-soft text-winner",
  winner: "bg-sage-soft text-sage",
  wrong: "bg-surface-sunk text-ink-faint",
};

function PlayerPointsRow({ breakdown }: { breakdown: FixtureBreakdown }) {
  // Le plus de points d'abord : lire la journée comme un classement match
  // par match, pas dans un ordre arbitraire.
  const players = [...breakdown.players]
    .filter((p) => !p.missing)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

  if (players.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pl-[29px] pr-1">
      {players.map((p) => {
        const net = (p.points ?? 0) + p.pointAdjustment;
        const pill = p.level ? LEVEL_PILL[p.level] : LEVEL_PILL.wrong;
        return (
          <span
            key={p.userId}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              pill,
            )}
          >
            {p.name}
            <span className="font-mono font-bold">{net}</span>
          </span>
        );
      })}
    </div>
  );
}

export function RoundFixtures({
  fixtures,
  breakdowns,
}: {
  fixtures: RoundFixture[];
  /** `fixtureId -> détail` — absent ou vide : pas de colonne de points (match pas encore joué). */
  breakdowns?: ReadonlyMap<string, FixtureBreakdown>;
}) {
  if (fixtures.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line">
        {fixtures.map((fixture) => {
          const played = hasResult(fixture.status, fixture.homeScore);
          const breakdown = played ? breakdowns?.get(fixture.id) : undefined;
          return (
            <li key={fixture.id}>
              <Link
                href={`/match/${fixture.id}`}
                className="flex flex-col gap-1.5 px-3 py-2 transition hover:bg-surface-sunk sm:px-4"
              >
                <span className="flex items-center gap-2.5">
                  <TeamLogo team={fixture.homeTeam} size={20} />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                    {fixture.homeTeam.shortName}
                    <span className="text-ink-faint"> — </span>
                    {fixture.awayTeam.shortName}
                  </span>
                  <TeamLogo team={fixture.awayTeam} size={20} />
                  {isInProgress(fixture.status) && (
                    <LiveBadge label={liveBadgeLabel(fixture.status, fixture.minute)} />
                  )}
                  <span
                    className={cn(
                      "tabular shrink-0 text-right font-mono",
                      played
                        ? "w-14 text-sm font-semibold text-ink"
                        : "w-24 text-[11px] text-ink-faint",
                    )}
                  >
                    {played
                      ? `${fixture.homeScore}-${fixture.awayScore}`
                      : formatShortKickoff(fixture.kickoffAt)}
                  </span>
                </span>

                {breakdown && <PlayerPointsRow breakdown={breakdown} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
