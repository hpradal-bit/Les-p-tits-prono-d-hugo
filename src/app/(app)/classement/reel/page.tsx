/**
 * Classement sportif réel de la compétition d'une ligue — celui de la
 * compétition, pas celui des joueurs. Il est alimenté par la synchronisation
 * (`competition_standings`) et n'entre dans aucun calcul de points.
 *
 * Générique par ligue plutôt que figé sur le Top 14 : une ligue Pro D2 doit
 * voir le classement réel de la Pro D2, pas celui d'une autre compétition.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Card, Label, TeamLogo } from "@/components/ui";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/server";
import { resolveLeagueId } from "@/lib/leagues/queries.ts";
import { loadActiveSeason, loadCompetitionStandings } from "@/lib/standings/queries";
import { formatDateTime } from "@/lib/standings/format";

export const metadata = { title: "Classement réel" };

const params = z.object({ league: z.string().uuid().optional() });

export default async function ClassementReelPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/connexion");

  const { league: requested } = params.catch({}).parse(await searchParams);
  const resolved = await resolveLeagueId(sb, user.id, requested);
  if (!resolved) redirect("/accueil");
  const { leagueId } = resolved;

  const season = await loadActiveSeason(sb, leagueId);
  const rows = season ? await loadCompetitionStandings(sb, season.id) : [];

  const updatedAt = rows.reduce<string | null>(
    (latest, row) => (latest === null || row.updatedAt > latest ? row.updatedAt : latest),
    null,
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Label>{season ? `${season.competitionName} · Saison ${season.label}` : "Compétition"}</Label>
        <h1 className="font-display text-3xl tracking-tight text-ink">
          Classement de {season?.competitionName ?? "la compétition"}
        </h1>
        <p className="text-sm text-ink-muted">
          Le vrai classement de la compétition. Il n&apos;a aucune influence sur les points de la
          ligue.
        </p>
      </header>

      {rows.length === 0 ? (
        <Card className="p-5 text-sm leading-relaxed text-ink-muted">
          Le classement de la compétition n&apos;a pas encore été synchronisé. Il apparaîtra
          après la première journée.
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <caption className="sr-only">Classement de {season?.competitionName}</caption>
            <thead>
              <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                <th scope="col" className="py-2.5 pl-3 pr-2 font-normal">
                  #
                </th>
                <th scope="col" className="py-2.5 pr-2 font-normal">
                  Club
                </th>
                <th scope="col" className="py-2.5 pr-2 text-right font-normal">
                  J
                </th>
                <th scope="col" className="py-2.5 pr-2 text-right font-normal">
                  G
                </th>
                <th scope="col" className="py-2.5 pr-2 text-right font-normal">
                  N
                </th>
                <th scope="col" className="py-2.5 pr-2 text-right font-normal">
                  P
                </th>
                <th scope="col" className="py-2.5 pr-2 text-right font-normal">
                  Diff.
                </th>
                <th scope="col" className="py-2.5 pr-2 text-right font-normal">
                  Bonus
                </th>
                <th scope="col" className="py-2.5 pr-3 text-right font-normal">
                  Pts
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => {
                const diff = row.pointsFor - row.pointsAgainst;
                return (
                  <tr
                    key={row.team.id}
                    className={cn(
                      row.position <= 2 && "bg-winner-soft/30",
                      row.position > 2 && row.position <= 6 && "bg-sage-soft/30",
                      row.position >= rows.length - 1 && "bg-wrong-soft/30",
                    )}
                  >
                    <td className="tabular py-2.5 pl-3 pr-2 font-mono text-xs text-ink-faint">
                      {row.position}
                    </td>
                    <td className="py-2 pr-2">
                      <span className="flex items-center gap-2">
                        <TeamLogo team={row.team} size={22} />
                        <span className="truncate font-medium text-ink">
                          {row.team.shortName}
                        </span>
                      </span>
                    </td>
                    <td className="tabular py-2.5 pr-2 text-right font-mono text-xs text-ink-muted">
                      {row.played}
                    </td>
                    <td className="tabular py-2.5 pr-2 text-right font-mono text-xs text-ink-muted">
                      {row.won}
                    </td>
                    <td className="tabular py-2.5 pr-2 text-right font-mono text-xs text-ink-muted">
                      {row.drawn}
                    </td>
                    <td className="tabular py-2.5 pr-2 text-right font-mono text-xs text-ink-muted">
                      {row.lost}
                    </td>
                    <td
                      className={cn(
                        "tabular py-2.5 pr-2 text-right font-mono text-xs",
                        diff > 0 ? "text-winner" : diff < 0 ? "text-wrong" : "text-ink-muted",
                      )}
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td className="tabular py-2.5 pr-2 text-right font-mono text-xs text-ink-muted">
                      {row.bonusOffensive + row.bonusDefensive}
                    </td>
                    <td className="tabular py-2.5 pr-3 text-right font-mono text-sm font-bold text-ink">
                      {row.points}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {updatedAt && (
        <p className="font-mono text-[11px] text-ink-faint">
          Dernière synchronisation : {formatDateTime(updatedAt)}.
        </p>
      )}

      <Link
        href={`/classement?league=${leagueId}`}
        className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 text-sm font-semibold text-clay shadow-[var(--shadow-card)] transition hover:bg-surface-sunk"
      >
        ← Revenir au classement des joueurs
      </Link>
    </div>
  );
}
