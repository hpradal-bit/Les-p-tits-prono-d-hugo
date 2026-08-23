import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getViewer } from "@/lib/auth/session";
import { loadProfiles } from "@/lib/stats/queries";
import { ProfileView } from "./_components/profile-view";

export const metadata: Metadata = { title: "Mon profil" };
export const dynamic = "force-dynamic";

export default async function MonProfilPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/connexion");

  const data = await loadProfiles();
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

  return <ProfileView profile={profile} others={others} isMe />;
}
