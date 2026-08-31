import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { Card, Label } from "@/components/ui";
import { getViewer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveLeagueId } from "@/lib/leagues/queries.ts";
import { loadClubAvatars } from "@/lib/auth/avatar-policy";
import { loadProfiles } from "@/lib/stats/queries";
import { computeHeadToHead } from "@/lib/stats/head-to-head";
import { PlayerAvatar } from "../../_components/player-avatar";
import { ProfileView } from "../_components/profile-view";

export const metadata: Metadata = { title: "Profil" };
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const searchParamsSchema = z.object({ league: z.string().uuid().optional() });

export default async function ProfilJoueurPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ league?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/connexion");

  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  if (parsed.data === viewer.id) redirect("/profil");

  const sb = await createClient();
  const { league: requested } = searchParamsSchema.catch({}).parse(await searchParams);
  const resolved = await resolveLeagueId(sb, viewer.id, requested);
  if (!resolved) redirect("/accueil");

  const [data, clubs] = await Promise.all([
    loadProfiles(resolved.leagueId),
    loadClubAvatars(sb),
  ]);
  const them = data?.profiles.get(parsed.data);
  if (!them) notFound();

  const me = data!.profiles.get(viewer.id);
  const h2h = me ? computeHeadToHead(me, them) : null;

  return (
    <div className="flex flex-col gap-4">
      {h2h && (
        <Card className="p-5">
          <Label className="mb-4">Face-à-face</Label>

          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <PlayerAvatar player={h2h.a.player} clubs={clubs} size={36} />
              <span className="truncate text-[15px] font-semibold text-ink">
                {h2h.a.player.firstName}
              </span>
            </div>
            <span className="tabular shrink-0 font-display text-lg text-ink">
              {h2h.duels.aWins} – {h2h.duels.bWins}
            </span>
            <div className="flex min-w-0 items-center justify-end gap-2">
              <span className="truncate text-[15px] font-semibold text-ink">
                {h2h.b.player.firstName}
              </span>
              <PlayerAvatar player={h2h.b.player} clubs={clubs} size={36} />
            </div>
          </div>

          <p className="mb-4 text-center font-mono text-[11px] text-ink-faint">
            {h2h.roundsCompared === 0
              ? "Aucune journée comparable pour l'instant"
              : `${h2h.roundsCompared} journée${h2h.roundsCompared > 1 ? "s" : ""} comparée${h2h.roundsCompared > 1 ? "s" : ""}${h2h.duels.draws > 0 ? ` · ${h2h.duels.draws} nul${h2h.duels.draws > 1 ? "s" : ""}` : ""}`}
          </p>

          <ul className="flex flex-col gap-1.5">
            {h2h.lines.map((l) => (
              <li key={l.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <span
                  className={`tabular text-right font-mono text-[14px] ${
                    l.leader === "a" ? "font-semibold text-clay" : "text-ink-muted"
                  }`}
                >
                  {l.aText}
                </span>
                <span className="text-center font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                  {l.label}
                </span>
                <span
                  className={`tabular font-mono text-[14px] ${
                    l.leader === "b" ? "font-semibold text-clay" : "text-ink-muted"
                  }`}
                >
                  {l.bText}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ProfileView profile={them} others={[]} isMe={false} leagueId={resolved.leagueId} clubs={clubs} />
    </div>
  );
}
