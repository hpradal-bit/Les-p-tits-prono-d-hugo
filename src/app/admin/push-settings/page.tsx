import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, Label } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth/session";
import { VapidForm } from "./_components/vapid-form";

export const metadata: Metadata = { title: "Notifications — Admin" };
export const dynamic = "force-dynamic";

export default async function PushSettingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/connexion");

  const admin = createAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "push_notifications.vapid_public_key")
    .single();

  const currentKey = (data?.value as string) ?? "";

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-col gap-0.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          Admin
        </span>
        <h1 className="font-display text-[26px] leading-none text-ink">Notifications</h1>
      </header>

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <Label>Web Push (VAPID)</Label>
          <p className="text-[13px] text-ink-faint">
            Ajoute ta clé publique VAPID pour activer les notifications sur l&apos;écran d&apos;accueil.
            Cette clé est publique et sécurisée ; elle n&apos;authentifie pas, elle identifie juste
            tes notifications.
          </p>
        </div>
        <VapidForm currentKey={currentKey} />
      </Card>
    </div>
  );
}
