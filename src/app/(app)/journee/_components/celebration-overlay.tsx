"use client";

import { useEffect, useRef, useState } from "react";
import { fetchPendingCelebration, markCelebrationSeen } from "@/lib/celebration/actions";
import { CELEBRATION_CONTENT } from "@/lib/celebration/scenario";

const DURATION_MS = 4500;
const PARTICLE_COUNT = 18;

type Payload = Awaited<ReturnType<typeof fetchPendingCelebration>>;

/**
 * La célébration de début de semaine. Vérifie une fois au montage s'il y a
 * une journée réglée pas encore vue (`fetchPendingCelebration` — silencieuse
 * la plupart du temps, c'est le cas normal) ; si oui, une animation courte et
 * fermable, puis `markCelebrationSeen` pour ne plus jamais la remontrer pour
 * cette journée. Pure CSS, aucune librairie d'animation — reste léger.
 */
export function CelebrationOverlay({ leagueId }: { leagueId: string }) {
  const [payload, setPayload] = useState<Payload>(null);
  const dismissedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchPendingCelebration(leagueId).then((p) => {
      if (!cancelled && p) setPayload(p);
    });
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  useEffect(() => {
    if (!payload) return;
    const timer = setTimeout(dismiss, DURATION_MS);
    return () => clearTimeout(timer);
    // dismiss est stable pour la durée de vie du payload courant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  function dismiss() {
    if (dismissedRef.current || !payload) return;
    dismissedRef.current = true;
    markCelebrationSeen(leagueId, payload.roundId);
    setPayload(null);
  }

  if (!payload) return null;
  const content = CELEBRATION_CONTENT[payload.scenario];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-ink/70 p-4"
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-label="Résultats de la journée"
    >
      <style>{`
        @keyframes celebration-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 0; }
          12% { opacity: 1; }
          100% { transform: translateY(110vh) rotate(340deg); opacity: 0.9; }
        }
        @keyframes celebration-pop {
          0% { transform: scale(0.7); opacity: 0; }
          65% { transform: scale(1.04); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        const left = Math.round(((i * 53) % 100));
        const delay = (i % 6) * 0.16;
        const duration = 2.3 + (i % 5) * 0.28;
        const emoji = content.emojis[i % content.emojis.length];
        return (
          <span
            key={i}
            aria-hidden
            className="pointer-events-none absolute top-0 text-2xl"
            style={{
              left: `${left}%`,
              animation: `celebration-fall ${duration}s ${delay}s ease-in forwards`,
            }}
          >
            {emoji}
          </span>
        );
      })}

      <div
        className="relative z-10 flex w-full max-w-xs flex-col items-center gap-2 rounded-[28px] bg-surface px-6 py-7 text-center shadow-[var(--shadow-lift)]"
        style={{ animation: "celebration-pop 0.4s ease-out" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-4xl" aria-hidden>
          {content.emojis[0]}
        </span>
        <p className="font-display text-[20px] leading-tight text-ink">{content.title}</p>
        <p className="text-[13.5px] text-ink-muted">
          {content.subtitle(payload.roundName, payload.points)}
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-2 rounded-full bg-clay px-5 py-2.5 text-[13px] font-bold text-surface"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
