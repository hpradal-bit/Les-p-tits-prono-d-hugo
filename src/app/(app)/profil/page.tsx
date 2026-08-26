import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Card } from "@/components/ui";
import { getViewer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveLeagueId } from "@/lib/leagues/queries.ts";
import { loadProfiles } from "@/lib/stats/queries";
import { ProfileView } from "./_components/profile-view";

export const metadata: Metadata = { title: "Mon profil" };
export const dynamic = "force-dynamic";

const params = z.object({ league: z.string().uuid().optional() });

export default async function MonProfilPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/connexion");

  const sb = await createClient();
  const { league: requested } = params.catch({}).parse(await searchParams);
  const resolved = await resolveLeagueId(sb, viewer.id, requested);
  if (!resolved) redirect("/accueil");

  const data = await loadProfiles(resolved.leagueId);
  const profile = data?.profiles.get(viewer.id);

  if (!profile) {
    return (
      <Card className="p-8 text-center">
        <p className="text-ink-muted">
          Ta fiche apparaîtra dès la première journée jouée.
        </p>
      </Card>
    );
  }

  const others = [...data!.profiles.values()]
    .filter((p) => p.player.userId !== viewer.id)
    .sort((a, b) => b.points - a.points);

  return <ProfileView profile={profile} others={others} isMe leagueId={resolved.leagueId} />;
}
