import Link from "next/link";
import { TeamLogo } from "@/components/ui";
import type { JourneyFixture, PredictionScore } from "@/lib/predictions/types";
import type { Ruleset } from "@/lib/types";

/** Le libellé du pronostic du joueur, en clair. */
function draftLabel(item: JourneyFixture, ruleset: Ruleset): string | null {
  const d = item.draft;
  if (!d || !d.outcome) return null;

  const side =
    d.outcome === "home" ? item.fixture.homeTeam.shortName
    : d.outcome === "away" ? item.fixture.awayTeam.shortName
    : "Nul";

  if (d.exactHomeScore !== null && d.exactAwayScore !== null) {
    return `${side} ${d.exactHomeScore}-${d.exactAwayScore}`;
  }
  const bucket = ruleset.buckets.find((b) => b.id === d.marginBucketId);
  return bucket ? `${side} ${bucket.label}` : side;
}

const LEVEL_BADGE: Record<string, { label: string; className: string }> = {
  exact_score: { label: "Score exact", className: "bg-perfect-soft text-perfect" },
  winner_and_margin: { label: "Parfait", className: "bg-winner-soft text-winner" },
  winner: { label: "Bon", className: "bg-sage-soft text-sage" },
  wrong: { label: "Raté", className: "bg-surface-sunk text-ink-faint" },
};

function ScoreBadge({ score }: { score: PredictionScore }) {
  const badge = LEVEL_BADGE[score.level];
  if (!badge) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.className}`}>
      +{score.points} · {badge.label}
    </span>
  );
}

function kickoffLabel(iso: string, timeZone: string, confirmed: boolean) {
  const t = new Date(iso).toLocaleString("fr-FR", {
    weekday: "short", hour: "2-digit", minute: "2-digit", timeZone,
  }).toUpperCase().replace(".", "");
  return confirmed ? t : `${t} · PROVISOIRE`;
}

export function MatchCard({
  item,
  ruleset,
  timeZone,
  leagueId,
}: {
  item: JourneyFixture;
  ruleset: Ruleset;
  timeZone: string;
  /** La ligue affichée : sans elle, la page du prono ne saurait pas où revenir. */
  leagueId: string;
}) {
  const { fixture } = item;
  const live = fixture.status === "live";
  const done = fixture.status === "finished" || fixture.status === "official";
  const hasScore = fixture.homeScore !== null && fixture.awayScore !== null;
  const label = draftLabel(item, ruleset);

  return (
    <Link
      href={
        item.isLocked
          ? `/match/${fixture.id}`
          : `/journee/${fixture.id}?league=${leagueId}`
      }
      className="block rounded-[28px] bg-surface p-3 shadow-[var(--shadow-card)] transition active:scale-[0.995]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-muted">
          {kickoffLabel(fixture.kickoffAt, timeZone, fixture.kickoffConfirmed)}
        </span>

        {live ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-clay-soft px-2.5 py-1 text-[11px] font-bold text-live">
            <span className="size-1.5 animate-pulse rounded-full bg-live" aria-hidden />
            {fixture.minute ? `${fixture.minute}'` : "LIVE"}
          </span>
        ) : item.isLocked || done ? (
          <span className="rounded-full bg-winner-soft px-2.5 py-1 text-[11px] font-bold text-winner">
            {done ? "TERMINÉ" : "VERROUILLÉ"}
          </span>
        ) : label ? (
          <span className="rounded-full bg-winner-soft px-2.5 py-1 text-[11px] font-bold text-winner">
            JOUÉ
          </span>
        ) : (
          <span className="rounded-full bg-clay px-2.5 py-1 text-[11px] font-bold text-surface">
            À JOUER
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunk">
            <TeamLogo team={fixture.homeTeam} size={26} />
          </span>
          <span className="truncate text-[15px] font-bold text-ink">
            {fixture.homeTeam.shortName}
          </span>
        </div>

        {hasScore ? (
          <span className={`tabular shrink-0 text-[19px] font-bold ${done ? "text-ink-muted" : "text-ink"}`}>
            {fixture.homeScore}–{fixture.awayScore}
          </span>
        ) : (
          <span className="shrink-0 text-[12px] text-ink-faint">VS</span>
        )}

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5">
          <span className="truncate text-right text-[15px] font-bold text-ink">
            {fixture.awayTeam.shortName}
          </span>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunk">
            <TeamLogo team={fixture.awayTeam} size={26} />
          </span>
        </div>
      </div>

      {label && (
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[12px] text-ink-muted">
          <span>
            Ton prono : {label}
            {item.isAuto && <span title="Joué automatiquement au verrouillage"> 😴</span>}
          </span>
          {item.score && <ScoreBadge score={item.score} />}
        </div>
      )}
    </Link>
  );
}
