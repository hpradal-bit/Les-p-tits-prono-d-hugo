/**
 * Les matchs d'une journée, en passerelle vers le Match Center.
 *
 * Pour un match joué, la colonne de droite résume en une ligne par joueur
 * "qui a marqué quoi sur CE match" — demande explicite d'Hugo ("je vois M en
 * dessous, en dessous, C... et pour chaque match le nombre de points que la
 * personne a eu") plutôt que le seul score final, trop pauvre en information
 * pour suivre la journée d'un coup d'œil. Les points viennent de
 * `loadFixtureBreakdowns` (même lecture que `/journee` et `/resultats`),
 * jamais recalculés ici.
 */

import Link from "next/link";
import { Card, LiveBadge, TeamLogo } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatShortKickoff, hasResult, isInProgress, liveBadgeLabel } from "@/lib/standings/format";
import type { RoundFixture } from "@/lib/standings/queries";
import type { FixtureBreakdown } from "@/lib/predictions/breakdowns";
import type { ScoreLevel } from "@/lib/types";

const LEVEL_DOT: Record<ScoreLevel, string> = {
  exact_score: "bg-perfect text-surface",
  winner_and_margin: "bg-winner text-surface",
  winner: "bg-sage text-surface",
  wrong: "bg-surface-sunk text-ink-faint",
};

/** Une lettre qui distingue le joueur dans la colonne — jamais son prénom entier, trop large. */
function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function PlayerPointsColumn({ breakdown }: { breakdown: FixtureBreakdown }) {
  // Le plus de points d'abord : lire la journée comme un classement match
  // par match, pas dans un ordre arbitraire.
  const players = [...breakdown.players]
    .filter((p) => !p.missing)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

  if (players.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-col gap-[3px]">
      {players.map((p) => {
        const net = (p.points ?? 0) + p.pointAdjustment;
        const dot = p.level ? LEVEL_DOT[p.level] : LEVEL_DOT.wrong;
        return (
          <div key={p.userId} className="flex items-center justify-end gap-1">
            <span
              className={cn(
                "flex size-[15px] shrink-0 items-center justify-center rounded-full font-mono text-[8.5px] font-bold",
                dot,
              )}
              title={p.name}
              aria-hidden
            >
              {initialOf(p.name)}
            </span>
            <span className="tabular w-4 text-right font-mono text-[11px] font-bold text-ink">
              {net}
            </span>
          </div>
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
                className="flex items-center gap-2.5 px-3 py-2 transition hover:bg-surface-sunk sm:px-4"
              >
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

                {played ? (
                  <>
                    <span className="tabular shrink-0 text-right font-mono text-[11px] font-semibold text-ink-muted">
                      {fixture.homeScore}-{fixture.awayScore}
                    </span>
                    {breakdown && <PlayerPointsColumn breakdown={breakdown} />}
                  </>
                ) : (
                  <span className="tabular w-24 shrink-0 text-right font-mono text-[11px] text-ink-faint">
                    {formatShortKickoff(fixture.kickoffAt)}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
