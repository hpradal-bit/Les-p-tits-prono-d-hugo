/**
 * Petites briques d'affichage communes aux écrans de classement.
 * Rien de métier ici : uniquement la mise en forme des valeurs calculées
 * par `src/lib/standings/engine`.
 */

import { cn } from "@/lib/cn";
import type { StandingsRow, StreakInfo } from "@/lib/standings/engine";
import type { ScoreLevel } from "@/lib/types";

/** Évolution depuis la journée précédente. */
export function Movement({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span
        className="font-mono text-[11px] text-ink-faint"
        title="Pas de journée précédente pour comparer"
      >
        —
      </span>
    );
  }
  if (value === 0) {
    return (
      <span className="font-mono text-[11px] text-ink-faint" title="Place inchangée">
        =
      </span>
    );
  }
  const up = value > 0;
  return (
    <span
      className={cn(
        "tabular font-mono text-[11px] font-semibold",
        up ? "text-winner" : "text-wrong",
      )}
      title={
        up
          ? `${value} place${value > 1 ? "s" : ""} gagnée${value > 1 ? "s" : ""}`
          : `${-value} place${-value > 1 ? "s" : ""} perdue${-value > 1 ? "s" : ""}`
      }
    >
      {up ? "▲" : "▼"} {Math.abs(value)}
    </span>
  );
}

/** Série en cours : bons pronostics, ou ratés, d'affilée. */
export function Streak({ streak }: { streak: StreakInfo | null }) {
  if (!streak || streak.length < 2) return null;
  const good = streak.kind === "good";
  return (
    <span
      className={cn("font-mono text-[11px] font-semibold", good ? "text-winner" : "text-wrong")}
      title={
        good
          ? `${streak.length} pronostics réussis d'affilée`
          : `${streak.length} pronostics ratés d'affilée`
      }
    >
      {good ? "🔥" : "💀"} {streak.length}
    </span>
  );
}

export function formatSuccessRate(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)} %`;
}

export function pointsLabel(points: number): string {
  return `${points} pt${Math.abs(points) > 1 ? "s" : ""}`;
}

/** Le détail d'une ligne : pronostics joués, réussite, série, forme. */
export function RowStats({ row }: { row: StandingsRow }) {
  const showStreak = row.streak !== null && row.streak.length >= 2;
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-ink-faint">
      {row.recentForm.length > 0 && <FormDots levels={row.recentForm} />}
      <span className="tabular">
        {row.played} prono{row.played > 1 ? "s" : ""}
      </span>
      <span aria-hidden>·</span>
      <span className="tabular" title="Part de pronostics rapportant au moins un point">
        {formatSuccessRate(row.successRate)} de réussite
      </span>
      {row.counts.exact_score > 0 && (
        <>
          <span aria-hidden>·</span>
          <span className="tabular text-perfect" title="Scores exacts">
            👌 {row.counts.exact_score}
          </span>
        </>
      )}
      {(row.bonusPoints !== 0 || row.adjustmentPoints !== 0) && (
        <>
          <span aria-hidden>·</span>
          <span className="tabular" title="Questions bonus et ajustements">
            {row.bonusPoints !== 0 ? `bonus ${signed(row.bonusPoints)}` : ""}
            {row.bonusPoints !== 0 && row.adjustmentPoints !== 0 ? " " : ""}
            {row.adjustmentPoints !== 0 ? `ajust. ${signed(row.adjustmentPoints)}` : ""}
          </span>
        </>
      )}
      {showStreak && (
        <>
          <span aria-hidden>·</span>
          <Streak streak={row.streak} />
        </>
      )}
    </p>
  );
}

export function signed(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

const FORM_DOT: Record<ScoreLevel, { className: string; label: string }> = {
  exact_score: { className: "bg-perfect", label: "Score exact" },
  winner_and_margin: { className: "bg-winner", label: "Bon écart" },
  winner: { className: "bg-sage", label: "Bon vainqueur" },
  wrong: { className: "bg-ink-faint/40", label: "Raté" },
};

export function FormDots({ levels }: { levels: ScoreLevel[] }) {
  if (levels.length === 0) return null;
  return (
    <span className="flex items-center gap-0.5" title="5 derniers résultats">
      {levels.map((level, i) => {
        const dot = FORM_DOT[level] ?? FORM_DOT.wrong;
        return (
          <span
            key={i}
            className={cn("inline-block size-2 rounded-full", dot.className)}
            title={dot.label}
          />
        );
      })}
    </span>
  );
}
