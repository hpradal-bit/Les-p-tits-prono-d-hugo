"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TeamLogo } from "@/components/ui";
import { cn } from "@/lib/cn";
import { saveRoundPredictions } from "@/lib/predictions/actions";
import type { JourneyFixture } from "@/lib/predictions/types";
import type { MatchOutcome, Ruleset, Uuid } from "@/lib/types";

/** L'issue qu'impose un score : c'est le score qui commande, pas l'inverse. */
function outcomeOf(home: number, away: number): MatchOutcome {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

function bucketFor(margin: number, ruleset: Ruleset) {
  return ruleset.buckets.find(
    (b) => margin >= b.minPoints && (b.maxPoints === null || margin <= b.maxPoints),
  );
}

function Stepper({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="tabular text-[32px] font-bold leading-none text-ink">{value}</span>
      <div className="flex gap-1.5">
        <button
          type="button"
          aria-label={`${label} moins un`}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="grid size-7 place-items-center rounded-full border border-line-strong text-ink-muted active:scale-95"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round"><path d="M5 12h14" /></svg>
        </button>
        <button
          type="button"
          aria-label={`${label} plus un`}
          onClick={() => onChange(Math.min(200, value + 1))}
          className="grid size-7 place-items-center rounded-full bg-ink text-ground active:scale-95"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round"><path d="M5 12h14M12 5v14" /></svg>
        </button>
      </div>
    </div>
  );
}

export function PronoForm({
  item,
  roundId,
  ruleset,
  competitionCode,
}: {
  item: JourneyFixture;
  roundId: Uuid;
  ruleset: Ruleset;
  /** La compétition en cours : sans elle, l'envoi renverrait vers le Top 14. */
  competitionCode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const d = item.draft;
  const [outcome, setOutcome] = useState<MatchOutcome | null>(d?.outcome ?? null);
  const [bucketId, setBucketId] = useState<Uuid | null>(d?.marginBucketId ?? null);
  const [exactOn, setExactOn] = useState(d?.exactHomeScore !== null && d?.exactHomeScore !== undefined);
  const [home, setHome] = useState(d?.exactHomeScore ?? 20);
  const [away, setAway] = useState(d?.exactAwayScore ?? 15);

  const { fixture } = item;
  // Le score exact commande : l'issue et la tranche s'en déduisent.
  const effectiveOutcome = exactOn ? outcomeOf(home, away) : outcome;
  const derivedBucket = exactOn ? bucketFor(Math.abs(home - away), ruleset) : null;
  const effectiveBucketId = exactOn ? (derivedBucket?.id ?? null) : bucketId;
  const canSubmit = effectiveOutcome !== null && effectiveBucketId !== null && !pending;

  function submit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const outcomeValue = effectiveOutcome as MatchOutcome;
      const result = await saveRoundPredictions({
        roundId,
        predictions: [{
          fixtureId: fixture.id,
          outcome: outcomeValue,
          marginBucketId: effectiveBucketId,
          marginValue: null,
          exactHomeScore: exactOn ? home : null,
          exactAwayScore: exactOn ? away : null,
        }],
      });
      if (!result.ok) {
        setError(result.rejected[fixture.id] ?? result.message);
        return;
      }
      router.push(`/journee?ligue=${competitionCode}`);
      router.refresh();
    });
  }

  const teamButton = (side: "home" | "away") => {
    const team = side === "home" ? fixture.homeTeam : fixture.awayTeam;
    const selected = effectiveOutcome === side;
    return (
      <button
        type="button"
        onClick={() => { setExactOn(false); setOutcome(side); }}
        aria-pressed={selected}
        className={cn(
          "flex flex-col items-center gap-2.5 rounded-[16px] px-2.5 py-4 transition",
          selected ? "bg-clay text-surface" : "bg-surface-sunk text-ink",
        )}
      >
        <span className="grid size-11 place-items-center rounded-full bg-surface">
          <TeamLogo team={team} size={32} />
        </span>
        <span className="text-[13px] font-bold leading-tight">{team.shortName}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-3.5">
      <section className="flex flex-col gap-3.5 rounded-[28px] bg-surface p-4 shadow-[var(--shadow-card)]">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          Qui gagne ?
        </span>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-2.5">
          {teamButton("home")}
          <button
            type="button"
            onClick={() => { setExactOn(false); setOutcome("draw"); }}
            aria-pressed={effectiveOutcome === "draw"}
            className={cn(
              "flex flex-col items-center justify-center gap-1.5 rounded-[16px] px-3 py-4 transition",
              effectiveOutcome === "draw" ? "bg-clay text-surface" : "bg-surface-sunk text-ink-faint",
            )}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round"><path d="M5 9h14M5 15h14" /></svg>
            <span className="text-[12px] font-semibold">Nul</span>
          </button>
          {teamButton("away")}
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Écart
          </span>
          <div className="flex flex-wrap gap-1.5">
            {ruleset.buckets.map((b) => {
              const selected = effectiveBucketId === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  disabled={exactOn}
                  onClick={() => setBucketId(b.id)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12px] transition",
                    selected
                      ? "bg-sage font-bold text-surface"
                      : "border border-line-strong font-semibold text-ink-muted",
                    exactOn && !selected && "opacity-40",
                  )}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
          {exactOn && derivedBucket && (
            <p className="text-[12px] text-ink-faint">
              Déduit de ton score exact : <strong className="text-sage">{derivedBucket.label}</strong>
            </p>
          )}
        </div>
      </section>

      {item.exactScore.eligible && (
        <section className="flex flex-col gap-3 rounded-[28px] bg-surface p-3.5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-3">
            <div className="flex flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-bold text-ink">Tenter le score exact</span>
              <span className="text-[12px] text-ink-faint">
                {item.exactScore.quota === null
                  ? "Autant que tu veux"
                  : `${item.exactScore.quota} par ${item.exactScore.period === "round" ? "journée" : item.exactScore.period === "month" ? "mois" : "saison"} · ${item.exactScore.remaining ?? 0} restant${(item.exactScore.remaining ?? 0) > 1 ? "s" : ""}`}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={exactOn}
              aria-label="Tenter le score exact"
              disabled={!item.exactScore.allowed && !exactOn}
              onClick={() => setExactOn((v) => !v)}
              className={cn(
                "flex h-[30px] w-[50px] shrink-0 items-center rounded-full p-[3px] transition",
                exactOn ? "justify-end bg-clay" : "justify-start bg-surface-sunk",
                !item.exactScore.allowed && !exactOn && "opacity-40",
              )}
            >
              <span className="size-6 rounded-full bg-surface shadow-sm" />
            </button>
          </div>

          {exactOn && (
            <>
              <div className="flex items-center justify-center gap-4 rounded-[16px] bg-clay-soft p-3">
                <Stepper value={home} onChange={setHome} label={fixture.homeTeam.shortName} />
                <span className="text-[20px] text-ink-faint">–</span>
                <Stepper value={away} onChange={setAway} label={fixture.awayTeam.shortName} />
              </div>
              <div className="flex items-start gap-2.5 text-[12px] leading-snug text-ink-muted">
                <svg className="mt-px shrink-0 text-clay" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></svg>
                <span>
                  Un score exact ne peut jamais te faire perdre de points : l&apos;écart est
                  déduit tout seul.
                </span>
              </div>
            </>
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="rounded-[16px] bg-wrong-soft px-3.5 py-2.5 text-[13.5px] text-wrong">
          {error}
        </p>
      )}

      <div className="flex-1" />

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className={cn(
          "sticky bottom-24 rounded-full py-4 text-center text-[16px] font-bold transition",
          canSubmit ? "bg-ink text-ground" : "bg-surface-sunk text-ink-faint",
        )}
      >
        {pending ? "Enregistrement…" : "Valider mon prono"}
      </button>
    </div>
  );
}
