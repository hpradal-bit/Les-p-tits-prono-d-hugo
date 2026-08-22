"use client";

import { useState } from "react";
import { Card, TeamLogo } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { MarginBucket, MatchOutcome, Team } from "@/lib/types";
import { formatKickoff, lockSentence } from "@/lib/predictions/lock";
import type { JourneyFixture, PredictionDraft } from "@/lib/predictions/types";

/* ---------------------------------------------------------------------------
   Une carte = un match. Trois gestes au maximum, tous au pouce :
   le vainqueur, la tranche d'écart, et — si le quota le permet — le score exact.
   --------------------------------------------------------------------------- */

export const EMPTY_DRAFT: PredictionDraft = {
  outcome: null,
  marginBucketId: null,
  marginValue: null,
  exactHomeScore: null,
  exactAwayScore: null,
};

/** La tranche dans laquelle tombe un écart. */
function bucketOf(margin: number, buckets: readonly MarginBucket[]): MarginBucket | null {
  return (
    buckets.find(
      (b) => margin >= b.minPoints && (b.maxPoints === null || margin <= b.maxPoints),
    ) ?? null
  );
}

interface Props {
  item: JourneyFixture;
  draft: PredictionDraft;
  buckets: MarginBucket[];
  marginMode: "buckets" | "distance";
  tolerance: number;
  timeZone: string;
  /** Horloge du serveur, corrigée du décalage du navigateur. */
  now: number;
  locked: boolean;
  /** Le quota autorise-t-il un score exact ici, compte tenu de la saisie en cours ? */
  exactAllowed: boolean;
  /** Pourquoi le score exact est refusé, le cas échéant. */
  exactReason: string | null;
  /** Refus renvoyé par le serveur au dernier enregistrement. */
  error?: string;
  onChange: (next: PredictionDraft) => void;
}

export function FixtureCard({
  item,
  draft,
  buckets,
  marginMode,
  tolerance,
  timeZone,
  now,
  locked,
  exactAllowed,
  exactReason,
  error,
  onChange,
}: Props) {
  const { fixture } = item;
  const { homeTeam: home, awayTeam: away } = fixture;
  const played = draft.outcome !== null;

  // L'ouverture du bloc « score exact » est un état d'écran, pas une donnée :
  // on ne préremplit aucun score, sinon on ferait dire au joueur autre chose
  // que ce qu'il a choisi.
  const [exactOpen, setExactOpen] = useState(
    draft.exactHomeScore !== null || draft.exactAwayScore !== null,
  );
  const exactIncomplete =
    exactOpen && (draft.exactHomeScore === null) !== (draft.exactAwayScore === null);

  /** Choisir un vainqueur. Un nul fixe l'écart à zéro : il n'y a rien à demander. */
  function chooseOutcome(outcome: MatchOutcome) {
    if (locked) return;
    const next: PredictionDraft = { ...draft, outcome };
    if (outcome === "draw") {
      next.marginBucketId = bucketOf(0, buckets)?.id ?? null;
      next.marginValue = 0;
      // Un score exact qui ne désigne plus le vainqueur choisi n'a pas de sens.
      if (draft.exactHomeScore !== draft.exactAwayScore) {
        next.exactHomeScore = null;
        next.exactAwayScore = null;
      }
    } else if (exactOpen && draft.exactHomeScore !== null && draft.exactAwayScore !== null) {
      const implied =
        draft.exactHomeScore > draft.exactAwayScore
          ? "home"
          : draft.exactHomeScore < draft.exactAwayScore
            ? "away"
            : "draw";
      if (implied !== outcome) {
        next.exactHomeScore = null;
        next.exactAwayScore = null;
      }
    }
    onChange(next);
  }

  function chooseBucket(bucketId: string) {
    if (locked) return;
    onChange({ ...draft, marginBucketId: bucketId });
  }

  function setMarginValue(value: number | null) {
    if (locked) return;
    onChange({ ...draft, marginValue: value });
  }

  /**
   * Saisir un score exact renseigne aussi le vainqueur et la tranche : le joueur
   * n'a rien à saisir en double, et il ne peut pas se contredire.
   */
  function setExact(side: "home" | "away", raw: string) {
    if (locked) return;
    const value = raw === "" ? null : Math.max(0, Math.min(200, Number.parseInt(raw, 10)));
    const parsed = value === null || Number.isNaN(value) ? null : value;

    const h = side === "home" ? parsed : draft.exactHomeScore;
    const a = side === "away" ? parsed : draft.exactAwayScore;
    const next: PredictionDraft = { ...draft, exactHomeScore: h, exactAwayScore: a };

    if (h !== null && a !== null) {
      next.outcome = h > a ? "home" : h < a ? "away" : "draw";
      const derived = bucketOf(Math.abs(h - a), buckets);
      if (draft.marginBucketId === null && derived) next.marginBucketId = derived.id;
      if (marginMode === "distance" && draft.marginValue === null) {
        next.marginValue = Math.abs(h - a);
      }
    }
    onChange(next);
  }

  function toggleExact() {
    if (locked) return;
    if (exactOpen) {
      setExactOpen(false);
      onChange({ ...draft, exactHomeScore: null, exactAwayScore: null });
    } else {
      setExactOpen(true);
    }
  }

  const derivedBucket =
    draft.exactHomeScore !== null && draft.exactAwayScore !== null
      ? bucketOf(Math.abs(draft.exactHomeScore - draft.exactAwayScore), buckets)
      : null;

  return (
    <Card
      className={cn(
        "overflow-hidden transition",
        locked && "opacity-80",
        !locked && played && "border-pine/35",
        error && "border-wrong",
      )}
    >
      {/* --- Bandeau : horaire et compte à rebours --------------------------- */}
      <div className="flex items-center justify-between gap-2 border-b border-line/70 px-3 py-1.5">
        <span className="tabular font-mono text-[11px] text-ink-muted">
          {formatKickoff(fixture.kickoffAt, timeZone)}
          {!fixture.kickoffConfirmed && (
            <span
              className="ml-1.5 text-leather"
              title="Horaire provisoire : la LNR n'a pas encore publié le jour et l'heure."
            >
              ~ provisoire
            </span>
          )}
        </span>
        <span
          className={cn(
            "tabular font-mono text-[11px]",
            locked ? "text-ink-faint" : "text-pine",
          )}
        >
          {locked ? "🔒 verrouillé" : lockSentence(fixture.locksAt, now)}
        </span>
      </div>

      {/* --- Le vainqueur ---------------------------------------------------- */}
      <div
        role="radiogroup"
        aria-label={`Vainqueur : ${home.name} contre ${away.name}`}
        className="grid grid-cols-[1fr_4rem_1fr] gap-1.5 p-2"
      >
        <OutcomeButton
          team={home}
          label={home.shortName}
          fixtureId={fixture.id}
          value="home"
          selected={draft.outcome === "home"}
          disabled={locked}
          onSelect={chooseOutcome}
        />
        <OutcomeButton
          label="Nul"
          fixtureId={fixture.id}
          value="draw"
          selected={draft.outcome === "draw"}
          disabled={locked}
          onSelect={chooseOutcome}
        />
        <OutcomeButton
          team={away}
          label={away.shortName}
          fixtureId={fixture.id}
          value="away"
          selected={draft.outcome === "away"}
          disabled={locked}
          onSelect={chooseOutcome}
          reversed
        />
      </div>

      {/* --- L'écart --------------------------------------------------------- */}
      {played && (
        <div className="border-t border-line/70 px-2 pb-2 pt-1.5">
          {draft.outcome === "draw" ? (
            <p className="font-mono text-[11px] text-ink-faint">
              Match nul : écart 0, tranche « {bucketOf(0, buckets)?.label ?? "0"} ».
            </p>
          ) : marginMode === "distance" ? (
            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                Écart
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={200}
                disabled={locked}
                value={draft.marginValue ?? ""}
                onChange={(e) =>
                  setMarginValue(e.target.value === "" ? null : Number(e.target.value))
                }
                className="tabular w-16 rounded-lg border border-line bg-surface-sunk px-2 py-1 text-center font-mono text-sm text-ink"
              />
              <span className="font-mono text-[11px] text-ink-faint">± {tolerance}</span>
            </label>
          ) : (
            <div
              role="radiogroup"
              aria-label={`Écart de points : ${home.shortName} contre ${away.shortName}`}
              className="-mx-1 flex snap-x gap-1 overflow-x-auto px-1 pb-0.5"
            >
              {buckets.map((b) => {
                const selected = draft.marginBucketId === b.id;
                const derived = !selected && derivedBucket?.id === b.id;
                return (
                  <label key={b.id} className="shrink-0 snap-start">
                    <input
                      type="radio"
                      name={`margin-${fixture.id}`}
                      className="peer sr-only"
                      checked={selected}
                      disabled={locked}
                      onChange={() => chooseBucket(b.id)}
                    />
                    <span
                      className={cn(
                        "tabular block cursor-pointer rounded-full px-2.5 py-1 font-mono text-[12px] transition",
                        "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pine",
                        selected
                          ? "bg-pine font-semibold text-white"
                          : derived
                            ? "bg-perfect-soft text-perfect"
                            : "bg-surface-sunk text-ink-muted",
                        locked && "cursor-default",
                      )}
                      title={derived ? "Tranche déduite de ton score exact" : undefined}
                    >
                      {b.label}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --- Le score exact --------------------------------------------------- */}
      {played && draft.outcome !== null && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line/70 px-2 py-1.5">
          <button
            type="button"
            onClick={toggleExact}
            disabled={locked || (!exactOpen && !exactAllowed)}
            aria-pressed={exactOpen}
            className={cn(
              "rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold transition",
              exactOpen
                ? "bg-perfect-soft text-perfect"
                : "bg-surface-sunk text-ink-muted hover:text-ink",
              "disabled:cursor-not-allowed disabled:opacity-45",
            )}
            title={!exactOpen && !exactAllowed ? (exactReason ?? undefined) : undefined}
          >
            👌 Score exact
          </button>

          {exactOpen ? (
            <span className="flex items-center gap-1.5">
              <ScoreInput
                label={`Points de ${home.name}`}
                value={draft.exactHomeScore}
                disabled={locked}
                onChange={(v) => setExact("home", v)}
              />
              <span className="font-mono text-ink-faint">–</span>
              <ScoreInput
                label={`Points de ${away.name}`}
                value={draft.exactAwayScore}
                disabled={locked}
                onChange={(v) => setExact("away", v)}
              />
              {derivedBucket && (
                <span className="font-mono text-[10px] text-ink-faint">
                  écart {derivedBucket.label}
                </span>
              )}
            </span>
          ) : (
            !exactAllowed &&
            exactReason && (
              <span className="font-mono text-[10px] text-ink-faint">{exactReason}</span>
            )
          )}
        </div>
      )}

      {/* --- Ce que le serveur a répondu --------------------------------------- */}
      {locked && !played && (
        <p className="border-t border-line/70 bg-wrong-soft px-3 py-1 font-mono text-[10px] text-wrong">
          Aucun prono sur ce match.
        </p>
      )}
      {exactIncomplete && (
        <p className="border-t border-line/70 px-3 py-1 font-mono text-[10px] text-leather">
          Score exact incomplet : saisis les deux scores, ou referme le bloc.
        </p>
      )}
      {item.isAuto && (
        <p className="border-t border-line/70 bg-surface-sunk px-3 py-1 font-mono text-[10px] text-ink-faint">
          🤖 Prono par défaut, posé au verrouillage.
        </p>
      )}
      {error && (
        <p className="border-t border-wrong/40 bg-wrong-soft px-3 py-1 font-mono text-[10px] text-wrong">
          {error}
        </p>
      )}
    </Card>
  );
}

function ScoreInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onChange: (raw: string) => void;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={200}
      aria-label={label}
      disabled={disabled}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="tabular w-12 rounded-lg border border-line bg-surface px-1 py-1 text-center font-mono text-sm font-semibold text-ink"
    />
  );
}

function OutcomeButton({
  team,
  label,
  fixtureId,
  value,
  selected,
  disabled,
  reversed,
  onSelect,
}: {
  team?: Team;
  label: string;
  fixtureId: string;
  value: MatchOutcome;
  selected: boolean;
  disabled: boolean;
  reversed?: boolean;
  onSelect: (o: MatchOutcome) => void;
}) {
  // Les couleurs viennent du club : elles sont en base, pas dans la feuille de style.
  const style =
    selected && team?.primaryColor
      ? { background: team.primaryColor, color: team.secondaryColor ?? "#FFFFFF" }
      : undefined;

  return (
    <label className={cn("block", disabled && "cursor-default")}>
      <input
        type="radio"
        name={`outcome-${fixtureId}`}
        className="peer sr-only"
        checked={selected}
        disabled={disabled}
        onChange={() => onSelect(value)}
      />
      <span
        style={style}
        className={cn(
          "flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 py-2 transition",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pine",
          reversed && "flex-row-reverse",
          selected
            ? style
              ? "font-bold shadow-[var(--shadow-card)]"
              : "bg-pine font-bold text-white"
            : "bg-surface-sunk text-ink-muted",
          disabled && "cursor-default",
        )}
      >
        {team && <TeamLogo team={team} size={22} />}
        <span className="truncate text-[13px] leading-tight">{label}</span>
      </span>
    </label>
  );
}
