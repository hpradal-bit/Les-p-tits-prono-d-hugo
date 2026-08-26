import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Card, Label } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/lib/auth/session";
import { loadLeagueById, loadLeagueMembers, loadMyLeagues } from "@/lib/leagues/queries.ts";
import { KeyCopy } from "./key-copy";
import { EditLeagueForm } from "./edit-league-form";
import { MemberRow } from "./member-row";

export const metadata: Metadata = { title: "Ma ligue" };
export const dynamic = "force-dynamic";

const params = z.object({ league: z.string().uuid().optional() });

export default async function MaLiguePage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const viewer = await requireViewer();
  const sb = await createClient();

  const myLeagues = await loadMyLeagues(sb, viewer.id);
  if (myLeagues.length === 0) redirect("/accueil");

  const { league: requested } = params.catch({}).parse(await searchParams);
  const leagueId =
    (requested && myLeagues.some((l) => l.leagueId === requested) ? requested : null) ??
    myLeagues[0].leagueId;

  const [league, members] = await Promise.all([
    loadLeagueById(sb, leagueId),
    loadLeagueMembers(sb, leagueId),
  ]);
  if (!league) redirect("/accueil");

  const me = members.find((m) => m.userId === viewer.id);
  const isLeagueAdmin = me?.role === "admin";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-0.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          {league.competitionName}
        </span>
        <h1 className="font-display text-[28px] leading-none text-ink">{league.name}</h1>
        {league.slogan && <p className="text-[13.5px] italic text-ink-muted">{league.slogan}</p>}
      </header>

      {myLeagues.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {myLeagues.map((l) => (
            <a
              key={l.leagueId}
              href={`/ligue?league=${l.leagueId}`}
              className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition ${
                l.leagueId === leagueId
                  ? "bg-clay text-white"
                  : "border border-line bg-surface text-ink-muted"
              }`}
            >
              {l.leagueName}
            </a>
          ))}
        </div>
      )}

      <Card className="flex flex-col gap-3 p-4">
        <Label>Informations</Label>
        <KeyCopy joinKey={league.joinKey} />
      </Card>

      {isLeagueAdmin && (
        <Card className="flex flex-col gap-3 p-4">
          <Label>Administration</Label>
          <EditLeagueForm league={league} />
        </Card>
      )}

      <section className="flex flex-col gap-2">
        <Label>
          {members.length} membre{members.length > 1 ? "s" : ""}
        </Label>
        <Card className="divide-y divide-line">
          {members.map((m) => (
            <div key={m.userId}>
              {isLeagueAdmin ? (
                <MemberRow leagueId={leagueId} member={m} isMe={m.userId === viewer.id} />
              ) : (
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-[14px] font-semibold text-ink">
                    {m.displayName}
                    {m.userId === viewer.id && <span className="text-ink-faint"> (toi)</span>}
                  </span>
                  <span className="text-[12px] text-ink-faint">
                    {m.role === "admin" ? "Administrateur" : "Joueur"}
                  </span>
                </div>
              )}
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
