"use client";

/** Le détail des réactions d'un message : qui a mis quoi (§2.7). */

import type { ReactionGroup } from "@/lib/chambrage/model";

export function ReactionDetailSheet({
  groups,
  nameFor,
  onClose,
}: {
  groups: ReactionGroup[];
  nameFor: (userId: string) => string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-[24px] bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[18px] text-ink">Réactions</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full bg-surface-sunk text-ink-muted"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.emoji} className="flex flex-col gap-1.5">
              <span className="text-[20px]" aria-hidden>
                {g.emoji}
              </span>
              <ul className="flex flex-col gap-1.5">
                {g.userIds.map((userId) => (
                  <li key={userId} className="text-[14px] text-ink">
                    {nameFor(userId)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
