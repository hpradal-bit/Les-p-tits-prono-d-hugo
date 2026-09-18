"use client";

/**
 * Les réactions : 80 % du plaisir du Vestiaire pour 20 % du travail.
 *
 * L'affichage change **avant** le serveur : `useOptimistic` allume la pastille
 * et bouge le compteur dès le doigt levé. Un aller-retour, même rapide, se
 * voit sur un emoji ; ici, le retour du serveur ne fait que confirmer. S'il
 * refuse, React rétablit tout seul l'état réel.
 */

import { useOptimistic } from "react";
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

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {shown.map((r) => (
        // Le formulaire reste : avant l'hydratation, un tap doit partir en
        // soumission native plutôt que d'être avalé par un gestionnaire de
        // clic qui n'existe pas encore. React l'intercepte ensuite et joue
        // l'affichage optimiste.
        <form
          key={r.emoji}
          action={async (data: FormData) => {
            addOptimistic(r.emoji);
            await toggleReaction(data);
          }}
        >
          <input type="hidden" name="postId" value={postId} />
          <input type="hidden" name="emoji" value={r.emoji} />
          <button
            type="submit"
            aria-label={`Réagir ${r.emoji}`}
            aria-pressed={r.mine}
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
        </form>
      ))}
    </div>
  );
}
