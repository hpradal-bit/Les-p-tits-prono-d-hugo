/**
 * Sélecteurs du classement. Ce sont de simples liens : l'état vit dans l'URL,
 * l'écran reste un composant serveur, et un classement se partage tel quel.
 */

import Link from "next/link";
import { cn } from "@/lib/cn";

export interface SegmentOption {
  value: string;
  label: string;
  href: string;
}

export function Segmented({
  options,
  current,
  label,
}: {
  options: SegmentOption[];
  current: string;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex w-full gap-1 rounded-full border border-line bg-surface-sunk p-1"
    >
      {options.map((option) => {
        const active = option.value === current;
        return (
          <Link
            key={option.value}
            href={option.href}
            aria-current={active ? "true" : undefined}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-center text-[13px] font-semibold transition",
              active
                ? "bg-surface text-ink shadow-[var(--shadow-card)]"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Navigation d'une journée à l'autre, parmi les journées déjà jouées. */
export function RoundPicker({
  name,
  previousHref,
  nextHref,
}: {
  name: string;
  previousHref: string | null;
  nextHref: string | null;
}) {
  const arrow =
    "flex size-9 items-center justify-center rounded-full border border-line text-ink-muted transition hover:bg-surface-sunk";
  return (
    <div className="flex items-center justify-between gap-3">
      {previousHref ? (
        <Link href={previousHref} className={arrow} aria-label="Journée précédente">
          ‹
        </Link>
      ) : (
        <span className={cn(arrow, "opacity-30")} aria-hidden>
          ‹
        </span>
      )}
      <p className="font-display text-lg text-ink">{name}</p>
      {nextHref ? (
        <Link href={nextHref} className={arrow} aria-label="Journée suivante">
          ›
        </Link>
      ) : (
        <span className={cn(arrow, "opacity-30")} aria-hidden>
          ›
        </span>
      )}
    </div>
  );
}
