import type { Metadata } from "next";
import { Card, Label } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadPublicKey } from "@/lib/push/send";
import { VapidForm } from "./_components/vapid-form";

export const metadata: Metadata = { title: "Notifications — Admin" };
export const dynamic = "force-dynamic";

/**
 * Les notifications demandent deux moitiés d'une même paire : la clé publique,
 * ici en base, et la clé privée, en variable serveur. Tant que l'une des deux
 * manque, rien ne part — et sans cet écran, rien ne le disait.
 */
export default async function PushSettingsPage() {
  // Le rôle est déjà vérifié par le layout de l'espace admin.
  const admin = createAdminClient();
  const publicKey = await loadPublicKey(admin);
  const hasPrivateKey = Boolean(process.env.VAPID_PRIVATE_KEY);
  const ready = Boolean(publicKey) && hasPrivateKey;

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
            ready ? "bg-winner-soft text-winner" : "bg-surface-sunk text-ink-muted"
          }`}
        >
          {ready
            ? "Tout est en place. Les joueurs peuvent activer les notifications depuis leurs Réglages."
            : "Les notifications sont en sommeil : il manque une moitié de la paire."}
        </p>
        <ul className="flex flex-col gap-1 text-[13px] text-ink-muted">
          <li>
            {publicKey ? "✅" : "⬜️"} Clé publique — enregistrée ici, dans la base.
          </li>
          <li>
            {hasPrivateKey ? "✅" : "⬜️"} Clé privée — variable serveur{" "}
            <span className="font-mono text-[12px]">VAPID_PRIVATE_KEY</span>, chez Vercel.
          </li>
        </ul>
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
