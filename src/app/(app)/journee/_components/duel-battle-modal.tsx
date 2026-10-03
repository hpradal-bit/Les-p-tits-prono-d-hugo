"use client";

/**
 * La fenêtre « en direct » d'un Duel : combien chaque joueur a marqué sur la
 * journée, combien de matchs restent, qui mène — pour que la cible (ou
 * l'auteur) puisse juger s'il faut, par exemple, poser un contre-pouvoir
 * avant la fin de la fenêtre.
 *
 * Même convention que `PowerModal` (bottom sheet sur mobile, fenêtre centrée
 * au-delà) et que la pastille « Mis à jour il y a Ns » : un point en direct se
 * rafraîchit en interrogeant une route, jamais en ouvrant un flux — ici
 * `/api/powers/duel/[usageId]`, qui lit les points des DEUX joueurs avec le
 * client admin (RLS interdirait sinon de lire l'adversaire).
 */

import { useEffect, useState } from "react";
import { PlayerAvatar } from "../../_components/player-avatar";
import type { PlayerRef } from "@/lib/standings/engine";

interface DuelBattleData {
  roundName: string;
  roundNumber: number;
  powerEmoji: string;
  powerName: string;
  initiator: PlayerRef;
  target: PlayerRef;
  initiatorPoints: number;
  targetPoints: number;
  totalFixtures: number;
  playedFixtures: number;
  remainingFixtures: number;
  tie: boolean;
  leaderId: string | null;
}

const POLL_MS = 20_000;

export function DuelBattleModal({ usageId, onClose }: { usageId: string; onClose: () => void }) {
  const [data, setData] = useState<DuelBattleData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/powers/duel/${usageId}`, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? "Impossible de charger le Duel.");
          return;
        }
        setData(await res.json());
        setError(null);
      } catch {
        if (!cancelled) setError("Impossible de charger le Duel.");
      }
    }

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [usageId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:items-center sm:pb-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-[28px] bg-surface p-5 shadow-[var(--shadow-lift)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-[19px] uppercase leading-tight text-ink">
            {data ? `${data.powerEmoji} ${data.powerName} en direct` : "Duel en direct"}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 text-[13px] text-ink-faint"
          >
            ✕
          </button>
        </div>

        {error && !data && <p className="text-[13px] text-wrong">{error}</p>}
        {!data && !error && <p className="text-[13px] text-ink-faint">Chargement…</p>}

        {data && (
          <>
            <p className="text-[11.5px] font-mono uppercase tracking-[0.1em] text-ink-faint">
              {data.roundName}
            </p>

            <div className="flex items-center justify-between gap-2">
              <PlayerSide player={data.initiator} points={data.initiatorPoints} leading={data.leaderId === data.initiator.userId} />
              <span className="shrink-0 text-[13px] font-bold text-ink-faint">VS</span>
              <PlayerSide player={data.target} points={data.targetPoints} leading={data.leaderId === data.target.userId} align="right" />
            </div>

            <div className="flex flex-col items-center gap-1 rounded-2xl bg-surface-sunk px-3.5 py-3 text-center">
              <p className="text-[13.5px] font-bold text-ink">
                {data.tie
                  ? "Égalité pour l'instant"
                  : `${data.leaderId === data.initiator.userId ? data.initiator.displayName : data.target.displayName} mène`}
              </p>
              <p className="text-[11.5px] text-ink-muted">
                {data.remainingFixtures > 0
                  ? `${data.remainingFixtures} match${data.remainingFixtures > 1 ? "s" : ""} restant${data.remainingFixtures > 1 ? "s" : ""} sur ${data.totalFixtures}`
                  : `Les ${data.totalFixtures} matchs de la journée sont joués`}
              </p>
            </div>

            <p className="text-center text-[11px] text-ink-faint">
              Le match se décide au total de points marqués sur toute la journée — mis à jour au fil des scores.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function PlayerSide({
  player,
  points,
  leading,
  align = "left",
}: {
  player: PlayerRef;
  points: number;
  leading: boolean;
  align?: "left" | "right";
}) {
  return (
    <div className={`flex flex-1 flex-col items-center gap-1.5 ${align === "right" ? "items-center" : "items-center"}`}>
      <PlayerAvatar player={player} size={56} className={leading ? "ring-2 ring-clay" : undefined} />
      <span className="max-w-full truncate text-[12.5px] font-semibold text-ink">{player.displayName}</span>
      <span className="font-mono text-[22px] font-bold text-ink">{points}</span>
    </div>
  );
}
