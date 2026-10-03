"use client";

/**
 * « Ce qui s'est passé sur cette journée » — un résumé graphique de chaque
 * pouvoir déclaré, en plus du texte brut déjà raconté par le Fil.
 *
 * Repliée par défaut : une simple pastille « Super-pouvoirs » (avec le
 * nombre d'activations du jour), qui ne prend presque pas de place tant que
 * le joueur n'a pas envie de regarder. Un tap déplie les cartes complètes
 * (avatar → flèche → avatar) ; un tap de plus les replie. Fini le bandeau
 * "fermé pour la journée puis plus jamais revu" (`localStorage`, une
 * fenêtre de session suffit maintenant) — ouvert/replié n'est plus une
 * décision définitive, juste un repli d'affichage.
 *
 * Le serveur (`journee/page.tsx`) a déjà filtré les pouvoirs pas encore
 * publics (`buildPowerDigest`, même règle que le Fil) : ce composant
 * n'affiche rien de plus que ce que les deux joueurs concernés savent déjà.
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

export function PowerDigestBanner({ items }: { roundId: string; items: PowerDigestItem[] }) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-[12.5px] font-bold text-ink">
          <span
            aria-hidden
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-clay-soft text-[13px]"
          >
            ⚡
          </span>
          Super-pouvoirs
          <span className="rounded-full bg-clay-soft px-2 py-0.5 text-[10.5px] font-bold text-ink-muted">
            {items.length} activé{items.length > 1 ? "s" : ""} aujourd&apos;hui
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-[11px] text-ink-faint">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-2.5 px-3.5 pb-3.5 pt-1">
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
      )}
    </section>
  );
}
