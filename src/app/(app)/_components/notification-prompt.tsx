"use client";

import { useEffect, useState } from "react";
import { readState, enable, type PushState } from "@/lib/push/client";

export function NotificationPrompt({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<PushState | null>(null);
  // Lu à l'initialisation, pas dans un effet : écrire cet état depuis un effet
  // relançait un rendu complet juste après le premier, sur l'écran le plus
  // lourd de l'application. L'initialiseur paresseux ne s'exécute qu'au
  // montage, et jamais côté serveur puisque le composant est « use client ».
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("notif-prompt-dismissed") !== null;
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    readState(vapidPublicKey)
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState("unsupported");
      });
    // Le composant peut disparaître avant la réponse du navigateur : on ne
    // pose pas d'état sur un composant démonté.
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey, dismissed]);

  if (dismissed || !state || state === "on" || state === "unsupported" || state === "denied") {
    return null;
  }

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem("notif-prompt-dismissed", "1"); } catch { /* noop */ }
  }

  async function activate() {
    if (busy) return;
    setBusy(true);
    try {
      const next = await enable(vapidPublicKey);
      setState(next);
      if (next === "on") dismiss();
    } catch {
      // silently fail
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-clay-soft px-4 py-3">
      <span className="text-lg" aria-hidden>🔔</span>
      <div className="flex flex-1 flex-col gap-0.5">
        <p className="text-[13px] font-semibold text-ink">Active les notifications</p>
        <p className="text-[11px] text-ink-muted">
          {state === "needs-install"
            ? "Installe d'abord l'app sur ton écran d'accueil."
            : "Pour savoir quand jouer et suivre les résultats."}
        </p>
      </div>
      <button
        type="button"
        disabled={busy || state === "needs-install" || state === "no-sw"}
        onClick={activate}
        className="shrink-0 rounded-full bg-clay px-3.5 py-1.5 text-[12px] font-bold text-surface disabled:opacity-40"
      >
        {busy ? "…" : "Activer"}
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 text-[18px] leading-none text-ink-faint"
        aria-label="Fermer"
      >
        ×
      </button>
    </div>
  );
}
