import { cn } from "@/lib/cn";
import type { SeasonRound } from "@/lib/predictions/types";

function formatRoundDate(iso: string, timeZone: string): string {
  const label = new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Bandeau d'une journée dans « Mes pronos » : numéro, date, et où elle en
 * est (à pronostiquer / à venir / terminée) — pour se repérer d'un coup
 * d'œil dans le défilement de toute la saison.
 */
export function RoundBanner({
  seasonRound,
  timeZone,
}: {
  seasonRound: SeasonRound;
  timeZone: string;
}) {
  const { round, firstKickoffAt, isCurrent } = seasonRound;
  const done = !isCurrent && round.status === "settled";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl px-4 py-3 transition",
        isCurrent
          ? "bg-clay text-surface shadow-[var(--shadow-card)]"
          : done
            ? "bg-surface-sunk text-ink-faint"
            : "border border-line bg-surface text-ink",
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-display text-[17px] leading-none">{round.name}</span>
        {firstKickoffAt && (
          <span
            className={cn(
              "font-mono text-[11px]",
              isCurrent ? "text-surface/75" : "text-ink-faint",
            )}
          >
            📅 {formatRoundDate(firstKickoffAt, timeZone)}
          </span>
        )}
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
          isCurrent
            ? "bg-surface/20 text-surface"
            : done
              ? "bg-surface text-ink-faint"
              : "bg-clay-soft text-clay",
        )}
      >
        {isCurrent ? "À pronostiquer" : done ? "Terminée" : "À venir"}
      </span>
    </div>
  );
}
