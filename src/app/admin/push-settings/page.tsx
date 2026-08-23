import type { Metadata } from "next";
import { Card, Label } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings } from "@/lib/settings";
import { loadPublicKey } from "@/lib/push/send";
import { readRules, describeQuiet } from "@/lib/push/rules";
import { getViewerContext } from "@/lib/admin/auth";
import { VapidForm } from "./_components/vapid-form";
import { TestForm } from "./_components/test-form";
import { AnnouncementForm } from "./_components/announcement-form";
import { RulesForm } from "./_components/rules-form";

export const metadata: Metadata = { title: "Notifications — Admin" };
export const dynamic = "force-dynamic";

/**
 * Les notifications demandent deux moitiés d'une même paire : la clé publique,
 * ici en base, et la clé privée, en variable serveur. Tant que l'une des deux
 * manque, rien ne part — et sans cet écran, rien ne le disait.
 */
export default async function PushSettingsPage() {
  // Le rôle est déjà vérifié par le layout de l'espace admin.
  const ctx = await getViewerContext();
  const admin = createAdminClient();

  const [publicKey, settings] = await Promise.all([
    loadPublicKey(admin),
    loadSettings(admin),
  ]);
  const rules = readRules(settings);
  const hasPrivateKey = Boolean(process.env.VAPID_PRIVATE_KEY);
  const ready = Boolean(publicKey) && hasPrivateKey;

  // Combien de joueurs sont réellement joignables, et combien ont un appareil
  // abonné : l'écart entre les deux explique la plupart des « je n'ai rien reçu ».
  const { data: members } = await admin
    .from("group_members")
    .select("user_id, profiles:user_id (is_active)")
    .eq("group_id", ctx?.groupId ?? "");

  const activeIds = (members ?? [])
    .filter((m) => {
      const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as
        | { is_active?: boolean }
        | null;
      return p?.is_active !== false;
    })
    .map((m) => m.user_id as string);

  let subscribed = 0;
  if (activeIds.length > 0) {
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("user_id")
      .in("user_id", activeIds)
      .is("revoked_at", null);
    subscribed = new Set((subs ?? []).map((s) => s.user_id as string)).size;
  }

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-col gap-0.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          Administration
        </span>
        <h1 className="font-display text-[26px] leading-none text-ink">Notifications</h1>
      </header>

      <Card className="flex flex-col gap-2 p-4">
        <Label>État</Label>
        <p
          className={`rounded-lg px-3 py-2 text-[13.5px] ${
            !rules.enabled
              ? "bg-wrong-soft text-wrong"
              : ready
                ? "bg-winner-soft text-winner"
                : "bg-surface-sunk text-ink-muted"
          }`}
        >
          {!rules.enabled
            ? "Notifications éteintes pour tout le groupe. Rien ne part, même une annonce."
            : ready
              ? "Tout est en place. Les joueurs peuvent activer les notifications depuis leurs Réglages."
              : "Les notifications sont en sommeil : il manque une moitié de la paire."}
        </p>
        <ul className="flex flex-col gap-1 text-[13px] text-ink-muted">
          <li>{publicKey ? "✅" : "⬜️"} Clé publique — enregistrée ici, dans la base.</li>
          <li>
            {hasPrivateKey ? "✅" : "⬜️"} Clé privée — variable serveur{" "}
            <span className="font-mono text-[12px]">VAPID_PRIVATE_KEY</span>, chez Vercel.
          </li>
          <li>
            {subscribed > 0 ? "✅" : "⬜️"} {subscribed} joueur{subscribed > 1 ? "s" : ""} sur{" "}
            {activeIds.length} {subscribed > 1 ? "ont" : "a"} un appareil abonné.
          </li>
          <li>
            {rules.enabled ? "✅" : "⛔️"} Règles du groupe — {rules.maxPerDay}/jour au plus,{" "}
            {describeQuiet(rules)}.
          </li>
        </ul>
        <TestForm ready={ready} />
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <Label>Écrire au groupe</Label>
          <p className="text-[13px] leading-relaxed text-ink-faint">
            Un message écrit à la main, envoyé à tous les joueurs actifs. Il respecte les heures de
            silence et les joueurs qui ont coupé leurs notifications, mais passe outre le plafond
            quotidien.
          </p>
        </div>
        <AnnouncementForm recipients={activeIds.length} />
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <Label>Les garde-fous</Label>
          <p className="text-[13px] leading-relaxed text-ink-faint">
            Ces règles valent pour tout le groupe. Chaque joueur peut ensuite se montrer plus
            silencieux dans ses propres Réglages, jamais plus bruyant.
          </p>
        </div>
        <RulesForm rules={rules} />
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <Label>Clé publique VAPID</Label>
          <p className="text-[13px] leading-relaxed text-ink-faint">
            Les deux clés vont par paire : remplacer celle-ci sans changer la privée coupe les
            notifications. Un changement de clé invalide aussi les abonnements existants — chaque
            joueur devra réactiver l&apos;interrupteur dans ses Réglages.
          </p>
        </div>
        <VapidForm currentKey={publicKey} />
      </Card>
    </div>
  );
}
