import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/lib/auth/session";
import { resolveLeagueId } from "@/lib/leagues/queries.ts";
import { loadActiveSeason } from "@/lib/standings/queries";
import { loadPlayers, loadRounds, loadAdjustments } from "@/lib/admin/queries";
import { PlayerCard } from "./_components/player-card";
import { RevertForm } from "./_components/revert-form";

export const metadata: Metadata = { title: "Joueurs" };
export const dynamic = "force-dynamic";

const params = z.object({ league: z.string().uuid().optional() });

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

export default async function AdminJoueursPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const viewer = await requireViewer();
  const sb = await createClient();
  const { league: requested } = params.catch({}).parse(await searchParams);
  const resolved = await resolveLeagueId(sb, viewer.id, requested);
  if (!resolved) redirect("/accueil");
  const { leagueId, leagues: myLeagues } = resolved;
  const activeLeague = myLeagues.find((l) => l.leagueId === leagueId)!;

  const season = await loadActiveSeason(sb, leagueId);
  if (!season) {
    return (
      <Card className="p-6 text-center">
        <p className="text-ink-muted">Aucune saison pour cette ligue.</p>
      </Card>
    );
  }

  const [players, rounds, adjustments] = await Promise.all([
    loadPlayers(season.id),
    loadRounds(activeLeague.competitionCode),
    loadAdjustments(season.id),
  ]);

  const active = players.filter((p) => p.isActive);
  const inactive = players.filter((p) => !p.isActive);

  return (
    <div className="flex flex-col gap-4">
      {myLeagues.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {myLeagues.map((l) => (
            <Link
              key={l.leagueId}
              href={`/admin/joueurs?league=${l.leagueId}`}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                l.leagueId === leagueId
                  ? "bg-clay text-surface"
                  : "border border-line bg-surface text-ink-muted"
              }`}
            >
              {l.leagueName}
            </Link>
          ))}
        </div>
      )}

      <Card className="border-sage/40 bg-sage-soft p-4">
        <p className="text-[14px] leading-relaxed text-ink">
          Un ajustement ne réécrit aucun point calculé : il s&apos;ajoute au
          classement dans sa propre ligne, avec sa raison, visible de tout le
          groupe. On l&apos;annule par son inverse, jamais en l&apos;effaçant.
        </p>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-sage">
          {season.competitionName} · {season.label}
        </p>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[19px] tracking-tight text-ink">
          {active.length} joueur{active.length > 1 ? "s" : ""} en lice
        </h2>
        {active.map((player) => (
          <PlayerCard key={player.id} player={player} rounds={rounds} leagueId={leagueId} />
        ))}
      </section>

      {inactive.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-[19px] tracking-tight text-ink">
            Hors classement
          </h2>
          {inactive.map((player) => (
            <PlayerCard key={player.id} player={player} rounds={rounds} leagueId={leagueId} />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[19px] tracking-tight text-ink">
          Les ajustements de la saison
        </h2>
        {adjustments.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-[14px] text-ink-muted">
              Aucun point n&apos;a encore été donné ou retiré à la main.
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {adjustments.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2.5"
              >
                <span
                  className={`font-mono text-[15px] tabular font-semibold ${
                    a.delta > 0 ? "text-winner" : "text-wrong"
                  }`}
                >
                  {a.delta > 0 ? "+" : ""}
                  {a.delta}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-ink">
                    {a.playerName}
                    {a.roundName && (
                      <span className="font-normal text-ink-muted"> · {a.roundName}</span>
                    )}
                  </span>
                  <span className="block text-[13px] leading-relaxed text-ink-muted">
                    {a.reason}
                  </span>
                  <span className="block font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-faint">
                    {formatDate(a.createdAt)} · {a.authorName}
                  </span>
                </span>
                <RevertForm adjustmentId={a.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
