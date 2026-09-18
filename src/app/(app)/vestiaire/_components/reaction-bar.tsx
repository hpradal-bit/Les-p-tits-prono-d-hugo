"use client";

/**
 * Les réactions : 80 % du plaisir du Vestiaire pour 20 % du travail.
 *
 * L'affichage change **avant** le serveur : `useOptimistic` allume la pastille
 * et bouge le compteur dès le doigt levé. Un aller-retour, même rapide, se
 * voit sur un emoji ; ici, le retour du serveur ne fait que confirmer. S'il
 * refuse, React rétablit tout seul l'état réel.
 */

import { useOptimistic, useTransition } from "react";
import { toggleReaction } from "@/lib/feed/actions";
import { applyToggle, type Reaction } from "@/lib/feed/reactions";
import { cn } from "@/lib/cn";

export function ReactionBar({
  postId,
  reactions,
  choices,
}: {
  postId: string;
  reactions: Reaction[];
  choices: string[];
}) {
  const base: Reaction[] = choices.map((emoji) => {
    const found = reactions.find((r) => r.emoji === emoji);
    return { emoji, count: found?.count ?? 0, mine: found?.mine ?? false };
  });

  const [shown, addOptimistic] = useOptimistic(base, applyToggle);
  const [, startTransition] = useTransition();

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {shown.map((r) => (
        <button
          key={r.emoji}
          type="button"
          aria-label={`Réagir ${r.emoji}`}
          aria-pressed={r.mine}
          onClick={() => {
            startTransition(async () => {
              addOptimistic(r.emoji);
              const data = new FormData();
              data.set("postId", postId);
              data.set("emoji", r.emoji);
              await toggleReaction(data);
            });
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] transition active:scale-95",
            r.mine
              ? "border-clay bg-clay-soft text-clay"
              : "border-line bg-surface text-ink-muted hover:bg-surface-sunk",
            r.count === 0 && !r.mine && "opacity-45 hover:opacity-100",
          )}
        >
          <span aria-hidden>{r.emoji}</span>
          {r.count > 0 && <span className="tabular font-mono text-[11px]">{r.count}</span>}
        </button>
      ))}
    </div>
  );
}
