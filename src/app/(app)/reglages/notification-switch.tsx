"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { readState, enable, disable, PushError, type PushState } from "@/lib/push/client";

const MESSAGES: Record<PushState, string> = {
  unsupported: "Ton navigateur ne sait pas envoyer de notifications.",
  "needs-install": "Sur iPhone, il faut d'abord installer l'app sur l'écran d'accueil.",
  denied: "Tu as refusé les notifications. Il faut les réautoriser dans les réglages du navigateur.",
  "no-sw":
    "L'app n'arrive pas à démarrer son service d'arrière-plan. Ferme complètement l'app puis rouvre-la ; si ça persiste, désinstalle et réinstalle-la.",
  off: "Deux messages par semaine au maximum : le rappel avant verrouillage, et la fin de journée.",
  on: "Tu recevras le rappel avant verrouillage et le résumé de fin de journée.",
};

export function NotificationSwitch({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readState().then(setState).catch(() => setState("unsupported"));
  }, []);

  async function toggle() {
    if (busy || !state) return;
    setBusy(true);
    setError(null);
    try {
      setState(state === "on" ? await disable() : await enable(vapidPublicKey));
    } catch (err) {
      // On affiche la vraie cause : « réessaie plus tard » n'a jamais réparé
      // une clé dépareillée ni un service worker absent.
      setError(
        err instanceof PushError
          ? err.message
          : "L'abonnement a échoué. Réessaie dans un instant.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (state === null) {
    return <p className="text-[13px] text-ink-faint">Vérification…</p>;
  }

  const actionable = state === "off" || state === "on";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-bold text-ink">Notifications</span>
          <span className="text-[12px] leading-snug text-ink-faint">{MESSAGES[state]}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state === "on"}
          aria-label="Activer les notifications"
          disabled={!actionable || busy}
          onClick={toggle}
          className={cn(
            "flex h-[30px] w-[50px] shrink-0 items-center rounded-full p-[3px] transition",
            state === "on" ? "justify-end bg-clay" : "justify-start bg-surface-sunk",
            (!actionable || busy) && "opacity-40",
          )}
        >
          <span className="size-6 rounded-full bg-surface shadow-sm" />
        </button>
      </div>

      {state === "needs-install" && (
        <Link
          href="/installer"
          className="rounded-full bg-clay py-3 text-center text-[15px] font-bold text-surface"
        >
          Installer l&apos;app en 3 étapes
        </Link>
      )}

      {error && (
        <p role="alert" className="rounded-[16px] bg-wrong-soft px-3.5 py-2.5 text-[13px] text-wrong">
          {error}
        </p>
      )}
    </div>
  );
}
