import Link from "next/link";
import { TeamLogo } from "@/components/ui";
import { cn } from "@/lib/cn";
import { marginBucketSentence, outcomeSideLabel, outcomeWasCorrect } from "@/lib/predictions/display";
import type { JourneyFixture, PredictionScore } from "@/lib/predictions/types";
import type { Ruleset } from "@/lib/types";

/** Le panneau « Ton prono », partagé avec la carte éditable de « Ma journée ». */
export function PredictionSummaryBox({
  item,
  ruleset,
}: {
  item: JourneyFixture;
  ruleset: Ruleset;
}) {
  const d = item.draft;
  if (!d || !d.outcome) return null;

  const side = outcomeSideLabel(d.outcome, item.fixture.homeTeam.shortName, item.fixture.awayTeam.shortName);
  const bucket = ruleset.buckets.find((b) => b.id === d.marginBucketId);
  const hasExact = d.exactHomeScore !== null && d.exactAwayScore !== null;

  const done = item.fixture.status === "finished" || item.fixture.status === "official";
  const hasResult = item.fixture.homeScore !== null && item.fixture.awayScore !== null;
  // Le vert/rouge ne dépend que du vainqueur pronostiqué, jamais du score
  // exact : les deux informations restent volontairement indépendantes.
  const outcomeCorrect =
    done && hasResult ? outcomeWasCorrect(d.outcome, item.fixture.homeScore!, item.fixture.awayScore!) : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-2xl px-3 py-2.5 text-[13px]",
        outcomeCorrect === null && "bg-surface-sunk text-ink",
        outcomeCorrect === true && "bg-winner-soft text-winner",
        outcomeCorrect === false && "bg-wrong-soft text-wrong",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">
          {outcomeCorrect === true && "🟩 "}
          {outcomeCorrect === false && "🟥 "}
          {outcomeCorrect === null && "🩶 "}
          {side}
          {item.isAuto && <span title="Joué automatiquement au verrouillage"> 😴</span>}
        </span>
        {outcomeCorrect === true && <span className="text-[11px] font-semibold">Pronostic gagnant</span>}
        {outcomeCorrect === false && <span className="text-[11px] font-semibold">Pronostic perdant</span>}
      </div>
      <p className={cn("text-[12px]", outcomeCorrect === null ? "text-ink-muted" : "opacity-90")}>
        Écart : {bucket ? marginBucketSentence(bucket) : "non précisé"}
      </p>
      <p className={cn("text-[12px]", outcomeCorrect === null ? "text-ink-muted" : "opacity-90")}>
        Score exact : {hasExact ? `${d.exactHomeScore}-${d.exactAwayScore}` : "non parié"}
      </p>
    </div>
  );
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

/**
 * Carte de match en lecture seule — matchs verrouillés, en cours ou terminés.
 * Les matchs encore ouverts au pronostic utilisent `EditableMatchCard`, qui
 * permet de jouer directement depuis « Ma journée » sans changer de page.
 */
export function MatchCard({
  item,
  ruleset,
  timeZone,
}: {
  item: JourneyFixture;
  ruleset: Ruleset;
  timeZone: string;
}) {
  const { fixture } = item;
  const live = fixture.status === "live";
  const done = fixture.status === "finished" || fixture.status === "official";
  const hasScore = fixture.homeScore !== null && fixture.awayScore !== null;

  return (
    <Link
      href={`/match/${fixture.id}`}
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
        ) : (
          <span className="rounded-full bg-winner-soft px-2.5 py-1 text-[11px] font-bold text-winner">
            {done ? "TERMINÉ" : "VERROUILLÉ"}
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

      {(item.draft?.outcome || item.score) && (
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2.5">
          <div className="flex-1">
            <PredictionSummaryBox item={item} ruleset={ruleset} />
          </div>
          {item.score && <ScoreBadge score={item.score} />}
        </div>
      )}
    </Link>
  );
}
