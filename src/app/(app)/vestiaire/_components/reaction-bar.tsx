"use client";

import { toggleReaction } from "@/lib/feed/actions";
import { cn } from "@/lib/cn";

/** Les réactions : 80 % du plaisir du Vestiaire pour 20 % du travail. */
export function ReactionBar({
  postId,
  reactions,
  choices,
}: {
  postId: string;
  reactions: { emoji: string; count: number; mine: boolean }[];
  choices: string[];
}) {
  const shown = choices.map((emoji) => {
    const found = reactions.find((r) => r.emoji === emoji);
    return { emoji, count: found?.count ?? 0, mine: found?.mine ?? false };
  });

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {shown.map((r) => (
        <form key={r.emoji} action={toggleReaction}>
          <input type="hidden" name="postId" value={postId} />
          <input type="hidden" name="emoji" value={r.emoji} />
          <button
            type="submit"
            aria-label={`Réagir ${r.emoji}`}
            aria-pressed={r.mine}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] transition",
              r.mine
                ? "border-pine bg-pine-soft text-pine"
                : "border-line bg-surface text-ink-muted hover:bg-surface-sunk",
              r.count === 0 && "opacity-45 hover:opacity-100",
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
