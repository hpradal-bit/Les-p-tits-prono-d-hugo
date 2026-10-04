/**
 * Les matchs d'une journée, en passerelle vers le Match Center.
 *
 * Pour un match joué, une colonne alignée à droite résume "qui a marqué quoi
 * sur CE match" — troisième version de cet affichage d'après les retours
 * d'Hugo : une initiale seule était illisible, un nom entier en ligne prenait
 * trop de place et cassait la comparaison visuelle. Ici : mini-avatar, 3
 * lettres du pseudo, points, et une pastille de couleur (verte = bon, grise =
 * raté, orange = score exact) — tout aligné en colonne pour comparer les
 * joueurs d'un coup d'œil, match par match. Les points viennent de
 * `loadFixtureBreakdowns` (même lecture que `/journee` et `/resultats`),
 * jamais recalculés ici.
 */

import Link from "next/link";
import { Card, LiveBadge, TeamLogo } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatShortKickoff, hasResult, isInProgress, liveBadgeLabel } from "@/lib/standings/format";
import { PlayerAvatar } from "../../_components/player-avatar";
import type { RoundFixture } from "@/lib/standings/queries";
import type { FixtureBreakdown } from "@/lib/predictions/breakdowns";
import type { PlayerRef } from "@/lib/standings/engine";
import type { ClubAvatar } from "@/lib/auth/avatars";
import type { ScoreLevel } from "@/lib/types";

const LEVEL_DOT: Record<ScoreLevel, string> = {
  exact_score: "bg-perfect",
  winner_and_margin: "bg-winner",
  winner: "bg-sage",
  wrong: "bg-ink-faint/30",
};

/** 3 lettres, jamais plus : la comparaison visuelle prime sur l'exactitude du pseudo tronqué. */
function shortName(name: string): string {
  return name.trim().slice(0, 3);
}

function PlayerPointsColumn({
  breakdown,
  playersById,
  clubs,
}: {
  breakdown: FixtureBreakdown;
  playersById: ReadonlyMap<string, PlayerRef>;
  clubs: readonly ClubAvatar[];
}) {
  // Le plus de points d'abord : lire la journée comme un classement match
  // par match, pas dans un ordre arbitraire.
  const players = [...breakdown.players]
    .filter((p) => !p.missing)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

  if (players.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-col gap-1">
      {players.map((p) => {
        const net = (p.points ?? 0) + p.pointAdjustment;
        const dot = p.level ? LEVEL_DOT[p.level] : LEVEL_DOT.wrong;
        const ref = playersById.get(p.userId);
        return (
          <div key={p.userId} className="flex items-center justify-end gap-1.5">
            {ref && <PlayerAvatar player={ref} clubs={clubs} size={16} />}
            <span className="w-7 shrink-0 truncate text-[10.5px] font-semibold text-ink-muted">
              {shortName(p.name)}
            </span>
            <span className="tabular w-3.5 shrink-0 text-right font-mono text-[11px] font-bold text-ink">
              {net}
            </span>
            <span className={cn("size-2 shrink-0 rounded-full", dot)} aria-hidden />
          </div>
        );
      })}
    </div>
  );
}

export function RoundFixtures({
  fixtures,
  breakdowns,
  players = [],
  clubs = [],
}: {
  fixtures: RoundFixture[];
  /** `fixtureId -> détail` — absent ou vide : pas de colonne de points (match pas encore joué). */
  breakdowns?: ReadonlyMap<string, FixtureBreakdown>;
  /** Pour l'avatar de chaque joueur dans la colonne — mêmes joueurs que le classement de la ligue. */
  players?: readonly PlayerRef[];
  clubs?: readonly ClubAvatar[];
}) {
  if (fixtures.length === 0) return null;

  const playersById = new Map(players.map((p) => [p.userId, p]));

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
                    {breakdown && (
                      <PlayerPointsColumn
                        breakdown={breakdown}
                        playersById={playersById}
                        clubs={clubs}
                      />
                    )}
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
