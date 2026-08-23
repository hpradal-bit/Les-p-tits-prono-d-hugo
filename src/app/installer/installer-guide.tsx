"use client";

import { useEffect, useState } from "react";
import { isStandalone } from "@/lib/push/client";

type Platform = "ios" | "android" | "desktop";

const STEPS: Record<Platform, { title: string; steps: string[]; note?: string }> = {
  ios: {
    title: "Sur iPhone, depuis Safari",
    steps: [
      "Touche le bouton Partager, en bas de l'écran — le carré avec la flèche vers le haut.",
      "Fais défiler et choisis « Sur l'écran d'accueil ».",
      "Touche « Ajouter ». L'icône apparaît avec tes autres applications.",
    ],
    note: "Sur iPhone, les notifications ne fonctionnent qu'une fois l'app installée. C'est une règle d'Apple, pas un choix de notre part.",
  },
  android: {
    title: "Sur Android, depuis Chrome",
    steps: [
      "Touche le menu ⋮ en haut à droite.",
      "Choisis « Installer l'application » ou « Ajouter à l'écran d'accueil ».",
      "Confirme. L'icône rejoint tes applications.",
    ],
  },
  desktop: {
    title: "Sur ordinateur",
    steps: [
      "Dans la barre d'adresse, cherche l'icône d'installation — un écran avec une flèche.",
      "Clique dessus, puis sur « Installer ».",
      "L'app s'ouvre dans sa propre fenêtre, sans barre d'adresse.",
    ],
  },
};

/** Deviné une seule fois, au premier rendu client. */
function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : "desktop";
}

export function InstallerGuide() {
  const [platform, setPlatform] = useState<Platform>(detectPlatform);
  const [installed, setInstalled] = useState(false);

  // L'app est-elle déjà installée ? Lu après le montage : le rendu serveur ne
  // peut pas le savoir, et l'écrire pendant le rendu casserait l'hydratation.
  useEffect(() => {
    const id = requestAnimationFrame(() => setInstalled(isStandalone()));
    return () => cancelAnimationFrame(id);
  }, []);

  if (installed) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[28px] bg-winner-soft p-7 text-center">
        <span className="text-3xl" aria-hidden>✅</span>
        <p className="font-display text-[19px] text-winner">C&apos;est déjà fait</p>
        <p className="max-w-[34ch] text-[14px] leading-relaxed text-winner">
          Tu utilises l&apos;application installée. Les notifications peuvent être activées
          depuis les réglages.
        </p>
      </div>
    );
  }

  const guide = STEPS[platform];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-3.5 rounded-[28px] bg-surface p-5 shadow-[var(--shadow-card)]">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          {guide.title}
        </span>
        <ol className="flex flex-col gap-3.5">
          {guide.steps.map((step, i) => (
            <li key={step} className="flex items-start gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-clay text-[12px] font-bold text-surface">
                {i + 1}
              </span>
              <span className="text-[14px] leading-relaxed text-ink">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {guide.note && (
        <div className="flex items-start gap-3 rounded-[28px] border border-clay/40 bg-clay-soft p-4">
          <svg className="mt-px shrink-0 text-clay" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75">
            <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" />
          </svg>
          <p className="text-[13px] leading-relaxed text-ink">{guide.note}</p>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {(["ios", "android", "desktop"] as Platform[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            aria-pressed={platform === p}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
              platform === p
                ? "bg-ink text-ground"
                : "border border-line-strong text-ink-muted"
            }`}
          >
            {p === "ios" ? "iPhone" : p === "android" ? "Android" : "Ordinateur"}
          </button>
        ))}
      </div>
    </div>
  );
}
