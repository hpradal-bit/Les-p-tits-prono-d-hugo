import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Label } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { loadSettings, setting } from "@/lib/settings";
import { readRules } from "@/lib/push/rules";
import { getViewer } from "@/lib/auth/session";
import { NotificationSwitch } from "./notification-switch";

export const metadata: Metadata = { title: "Réglages" };
export const dynamic = "force-dynamic";

interface CatalogEntry {
  kind: string;
  emoji: string;
  label: string;
  description: string;
  wired?: boolean;
}

export default async function ReglagesPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/connexion");

  const sb = await createClient();
  const settings = await loadSettings(sb);
  const catalog = setting<CatalogEntry[]>(settings, "notifications.types", []);
  const rules = readRules(settings);
  const { quietFrom, quietTo, maxPerDay } = rules;
  const vapid = setting<string>(settings, "push_notifications.vapid_public_key", "");

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-col gap-0.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          Ton compte
        </span>
        <h1 className="font-display text-[26px] leading-none text-ink">Réglages</h1>
      </header>

      <Card className="p-4">
        {!rules.enabled ? (
          // Laisser activer un interrupteur qui ne déclenche rien serait pire
          // que de ne rien afficher : le joueur croirait avoir raté quelque chose.
          <p className="text-[13px] text-ink-faint">
            Les notifications sont suspendues pour tout le groupe. Rien ne partira tant que
            l&apos;organisation ne les aura pas rallumées.
          </p>
        ) : vapid ? (
          <NotificationSwitch vapidPublicKey={vapid} />
        ) : (
          <p className="text-[13px] text-ink-faint">
            Les notifications ne sont pas encore configurées côté serveur.
          </p>
        )}
      </Card>

      {catalog.length > 0 && (
        <Card className="flex flex-col gap-3 p-4">
          <Label>Ce que tu recevras</Label>
          <ul className="flex flex-col gap-2.5">
            {catalog.map((c) => (
              <li key={c.kind} className={`flex items-start gap-3 ${c.wired ? "" : "opacity-45"}`}>
                <span className="text-[16px]" aria-hidden>{c.emoji}</span>
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-semibold text-ink">
                    {c.label}
                    {!c.wired && (
                      <span className="ml-2 rounded-full bg-surface-sunk px-2 py-0.5 font-mono text-[10px] font-normal text-ink-faint">
                        bientôt
                      </span>
                    )}
                  </span>
                  <span className="text-[12px] leading-snug text-ink-faint">{c.description}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="flex flex-col gap-2 p-4">
        <Label>Les garde-fous</Label>
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Jamais plus de <strong className="text-ink">{maxPerDay}</strong> messages par jour.
          Rien entre <strong className="text-ink">{quietFrom}</strong> et{" "}
          <strong className="text-ink">{quietTo}</strong> — ce qui tombe la nuit est reporté au
          matin, pas supprimé. Et sept matchs ne font jamais sept notifications : une seule,
          résumée.
        </p>
      </Card>

      <div className="flex flex-col gap-2">
        <Link
          href="/installer"
          className="rounded-full border border-line-strong py-3.5 text-center text-[15px] font-bold text-ink"
        >
          Installer l&apos;app sur l&apos;écran d&apos;accueil
        </Link>
        <Link
          href="/mon-compte"
          className="rounded-full border border-line-strong py-3.5 text-center text-[15px] font-bold text-ink"
        >
          Modifier mon profil
        </Link>
      </div>
    </div>
  );
}
