"use client";

/**
 * « Ce qui s'est passé sur cette journée » — un résumé graphique de chaque
 * pouvoir déclaré, affiché une fois à la première ouverture de l'appli dans
 * la journée (pas à chaque navigation, et plus du tout une fois fermé) —
 * demande de l'hôte, en plus du texte brut déjà raconté par le Fil.
 *
 * Le serveur (`journee/page.tsx`) a déjà filtré les pouvoirs pas encore
 * publics (`buildPowerDigest`, même règle que le Fil) : ce composant
 * n'affiche rien de plus que ce que les deux joueurs concernés savent déjà.
 *
 * Fermeture mémorisée en `localStorage`, par journée et par jour civil
 * (côté navigateur, pas un fuseau serveur) — même convention que
 * `notif-prompt-dismissed` dans `NotificationPrompt` : un lecteur paresseux
 * à l'initialisation, jamais dans un effet, pour ne pas provoquer un second
 * rendu juste après le premier. Un nouveau pouvoir déclaré le lendemain
 * réapparaît : la clé change avec le jour.
 */

import { useState } from "react";
import { PlayerAvatar } from "../../_components/player-avatar";
import type { PlayerRef } from "@/lib/standings/engine";

export interface PowerDigestItem {
  usageId: string;
  powerEmoji: string;
  powerName: string;
  initiator: PlayerRef;
  target: PlayerRef | null;
  fixtureLabel: string | null;
  effect: string | null;
  caption: string;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PowerDigestBanner({ roundId, items }: { roundId: string; items: PowerDigestItem[] }) {
  const storageKey = `power-digest-dismissed:${roundId}:${todayKey()}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== null;
    } catch {
      return false;
    }
  });

  if (items.length === 0 || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      /* noop */
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
          <span aria-hidden>⚡</span> Ce qui s&apos;est passé sur cette journée
        </h2>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fermer"
          className="shrink-0 text-[14px] text-ink-faint"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {items.map((item) => (
          <div
            key={item.usageId}
            className="flex flex-col items-center gap-1.5 rounded-xl bg-surface-sunk px-3 py-2.5"
          >
            {item.target ? (
              <div className="flex items-center gap-3">
                <PlayerAvatar player={item.initiator} size={40} />
                <span className="text-[16px] text-ink-faint" aria-hidden>→</span>
                <PlayerAvatar player={item.target} size={40} />
              </div>
            ) : (
              <PlayerAvatar player={item.initiator} size={40} />
            )}

            <p className="text-center text-[12.5px] font-semibold text-ink">
              <span aria-hidden>{item.powerEmoji}</span> {item.caption}
            </p>

            {(item.fixtureLabel || item.effect) && (
              <p className="text-center text-[11px] leading-snug text-ink-muted">
                {[item.fixtureLabel, item.effect].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
