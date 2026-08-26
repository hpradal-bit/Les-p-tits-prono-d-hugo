import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Label } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { loadSettings, setting } from "@/lib/settings";
import { readRules, hasQuietHours } from "@/lib/push/rules";
import { getViewer } from "@/lib/auth/session";
import { mergePreferences, type CatalogEntry } from "@/lib/push/preferences";
import { NotificationSwitch } from "./notification-switch";
import { NotificationTypesForm } from "./notification-types-form";

export const metadata: Metadata = { title: "Réglages" };
export const dynamic = "force-dynamic";

export default async function ReglagesPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/connexion");

  const sb = await createClient();
  const settings = await loadSettings(sb);
  const catalog = setting<CatalogEntry[]>(settings, "notifications.types", []);
  const rules = readRules(settings);

  // Les choix du joueur — RLS oblige, on ne peut lire que les siens.
  const { data: prefRows } = await sb
    .from("notification_preferences")
    .select("kind, is_enabled")
    .eq("user_id", viewer.id)
    .eq("channel", "push");

  const preferences = mergePreferences(
    catalog,
    (prefRows ?? []) as Array<{ kind: string; is_enabled: boolean }>,
  );
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

      {preferences.length > 0 && (
        <Card className="flex flex-col gap-3 p-4">
          <Label>Ce que tu reçois</Label>
          <NotificationTypesForm items={preferences} />
        </Card>
      )}

      <Card className="flex flex-col gap-2 p-4">
        <Label>Les garde-fous</Label>
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Jamais plus de <strong className="text-ink">{maxPerDay}</strong> message
          {maxPerDay > 1 ? "s" : ""} par jour.{" "}
          {hasQuietHours(rules) ? (
            <>
              Rien entre <strong className="text-ink">{quietFrom}</strong> et{" "}
              <strong className="text-ink">{quietTo}</strong> — ce qui tombe la nuit est reporté au
              matin, pas supprimé.
            </>
          ) : (
            // Deux heures identiques valent « pas de silence » pour le moteur
            // d'envoi : promettre ici une nuit tranquille serait un mensonge.
            <>Aucune heure de silence pour l&apos;instant : un message peut tomber à toute heure.</>
          )}{" "}
          Et sept matchs ne font jamais sept notifications : une seule, résumée.
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
