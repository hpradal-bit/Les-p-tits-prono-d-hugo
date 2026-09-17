/**
 * Les compteurs de pouvoirs, sous le classement : une ligne par joueur, une
 * pastille par pouvoir, « utilisés / plafond ».
 *
 * Composant serveur : rien à cliquer, rien à ouvrir — juste de la lecture.
 */

import { cn } from "@/lib/cn";
import type { CounterRow } from "@/lib/powers/counters";

export function PowerCounters({
  rows,
  viewerId,
}: {
  rows: CounterRow[];
  viewerId: string | null;
}) {
  if (rows.length === 0 || rows[0].cells.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Super-pouvoirs utilisés
      </p>
      <div className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
        {rows.map((row) => (
          <div
            key={row.userId}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5"
          >
            <span
              className={cn(
                "min-w-[72px] text-[13px]",
                row.userId === viewerId ? "font-bold text-ink" : "font-semibold text-ink-muted",
              )}
            >
              {row.displayName}
            </span>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {row.cells.map((cell) => (
                <span
                  key={cell.powerId}
                  title={`${cell.name} — ${cell.used} sur ${cell.max}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold",
                    cell.exhausted
                      ? "bg-surface-sunk text-ink-faint line-through"
                      : cell.used > 0
                        ? "bg-clay-soft text-clay"
                        : "bg-surface-sunk text-ink-faint",
                  )}
                >
                  <span aria-hidden className="not-italic no-underline">
                    {cell.emoji}
                  </span>
                  {cell.used}/{cell.max}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="font-mono text-[11px] leading-relaxed text-ink-faint">
        Chaque pouvoir est utilisable un nombre limité de fois dans la saison. Une fois le
        compteur plein, il est définitivement épuisé.
      </p>
    </section>
  );
}
