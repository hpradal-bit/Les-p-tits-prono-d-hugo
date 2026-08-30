"use client";

import { TeamLogo } from "@/components/ui";
import { cn } from "@/lib/cn";
import { exactScoreSentence } from "@/lib/predictions/exact-score";
import { marginBucketSentence, outcomeSideLabel, predictionBoxTint } from "@/lib/predictions/display";
import type { JourneyFixture, PredictionDraft } from "@/lib/predictions/types";
import type { ExactScoreVerdict } from "@/lib/predictions/exact-score";
import type { MatchOutcome, Ruleset } from "@/lib/types";

function kickoffLabel(iso: string, timeZone: string, confirmed: boolean) {
  const t = new Date(iso).toLocaleString("fr-FR", {
    weekday: "short", hour: "2-digit", minute: "2-digit", timeZone,
  }).toUpperCase().replace(".", "");
  return confirmed ? t : `${t} · PROVISOIRE`;
}

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="tabular text-[28px] font-bold leading-none text-ink">{value}</span>
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

/**
 * Carte de match éditable — matchs encore ouverts sur « Ma journée ».
 *
 * Purement présentationnelle : tout l'état (le brouillon courant, le budget
 * de score exact déjà consommé sur la journée) vit dans `PredictionsBoard`,
 * qui partage ce budget entre toutes les cartes ouvertes en même temps. Cette
 * carte ne fait qu'afficher ce qu'on lui donne et remonter les clics.
 */
export function EditableMatchCard({
  item,
  ruleset,
  timeZone,
  draft,
  verdict,
  expanded,
  onToggleExpand,
  onPickOutcome,
  onPickBucket,
  onToggleExact,
  onExactChange,
  saving,
  error,
}: {
  item: JourneyFixture;
  ruleset: Ruleset;
  timeZone: string;
  draft: PredictionDraft;
  verdict: ExactScoreVerdict;
  expanded: boolean;
  onToggleExpand: () => void;
  onPickOutcome: (outcome: MatchOutcome) => void;
  onPickBucket: (bucketId: string) => void;
  onToggleExact: (on: boolean) => void;
  onExactChange: (home: number, away: number) => void;
  saving: boolean;
  error?: string;
}) {
  const { fixture } = item;
  const exactOn = draft.exactHomeScore !== null && draft.exactAwayScore !== null;
  const hasProno = draft.outcome !== null;
  const bucket = ruleset.buckets.find((b) => b.id === draft.marginBucketId);
  // Le match n'a pas encore de résultat ici : toujours la couleur du club
  // pronostiqué (ou neutre), jamais le vert/rouge du dénouement.
  const tint = hasProno ? predictionBoxTint(draft.outcome!, fixture.homeTeam, fixture.awayTeam, null) : null;

  const outcomeButton = (side: "home" | "away") => {
    const team = side === "home" ? fixture.homeTeam : fixture.awayTeam;
    const selected = draft.outcome === side;
    // Même logique de couleur que l'encart « Ton prono » : la teinte du club
    // choisi, jamais une couleur générique — cohérent du bouton jusqu'au résumé.
    const selectedTint = selected ? predictionBoxTint(side, fixture.homeTeam, fixture.awayTeam, null) : null;
    return (
      <button
        type="button"
        onClick={() => onPickOutcome(side)}
        aria-pressed={selected}
        style={
          selectedTint
            ? {
                background: selectedTint.background,
                boxShadow: selectedTint.dotColor ? `inset 0 0 0 2px ${selectedTint.dotColor}` : undefined,
              }
            : undefined
        }
        className={cn(
          "flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl px-2 py-2.5 transition active:scale-[0.98]",
          selected ? "text-ink" : "bg-surface-sunk text-ink",
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface">
          <TeamLogo team={team} size={26} />
        </span>
        <span className="max-w-full truncate text-[13px] font-bold leading-tight">{team.shortName}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-[28px] bg-surface p-3 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-muted">
          {kickoffLabel(fixture.kickoffAt, timeZone, fixture.kickoffConfirmed)}
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-bold",
            hasProno ? "bg-winner-soft text-winner" : "bg-clay px-2.5 py-1 text-surface",
          )}
        >
          {saving ? "…" : hasProno ? "JOUÉ" : "À JOUER"}
        </span>
      </div>

      {/* Le pronostic du vainqueur, directement cliquable — le cœur de la
          demande : aucune navigation, choix enregistré au premier tap. */}
      <div className="flex items-stretch gap-2">
        {outcomeButton("home")}
        <button
          type="button"
          onClick={() => onPickOutcome("draw")}
          aria-pressed={draft.outcome === "draw"}
          className={cn(
            "flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl px-3 py-2.5 transition active:scale-[0.98]",
            draft.outcome === "draw" ? "bg-clay text-surface" : "bg-surface-sunk text-ink-faint",
          )}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round"><path d="M5 9h14M5 15h14" /></svg>
          <span className="text-[12px] font-semibold">Nul</span>
        </button>
        {outcomeButton("away")}
      </div>

      {hasProno && (
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          style={{ background: tint?.background }}
          className="flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-left text-[13px] transition active:scale-[0.99]"
        >
          <span className="flex flex-1 items-center gap-1.5">
            {tint?.dotColor && (
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: tint.dotColor }} aria-hidden />
            )}
            <span className="font-bold text-ink">
              {outcomeSideLabel(draft.outcome!, fixture.homeTeam.shortName, fixture.awayTeam.shortName)}
            </span>
            <span className="text-ink-muted">
              {draft.outcome !== "draw" && (
                <>
                  {" · Écart : "}
                  {bucket ? marginBucketSentence(bucket) : "non précisé"}
                </>
              )}
              {" · Score exact : "}
              {exactOn ? `${draft.exactHomeScore}-${draft.exactAwayScore}` : "non parié"}
            </span>
          </span>
          <svg
            className={cn("shrink-0 text-ink-faint transition-transform", expanded && "rotate-180")}
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}

      {expanded && hasProno && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          {draft.outcome !== "draw" && (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                Écart
              </span>
              <div className="flex flex-wrap gap-1.5">
                {ruleset.buckets.map((b) => {
                  const selected = draft.marginBucketId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      disabled={exactOn}
                      onClick={() => onPickBucket(b.id)}
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
            </div>
          )}

          {verdict.eligible && (
            <div className="flex flex-col gap-2.5 rounded-2xl bg-surface-sunk p-3">
              <div className="flex items-center gap-3">
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-bold text-ink">Tenter le score exact</span>
                  <span className="text-[11.5px] text-ink-faint">{exactScoreSentence(verdict)}</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={exactOn}
                  aria-label="Tenter le score exact"
                  disabled={!verdict.allowed && !exactOn}
                  onClick={() => onToggleExact(!exactOn)}
                  className={cn(
                    "flex h-[28px] w-[46px] shrink-0 items-center rounded-full p-[3px] transition",
                    exactOn ? "justify-end bg-clay" : "justify-start bg-surface",
                    !verdict.allowed && !exactOn && "opacity-40",
                  )}
                >
                  <span className="size-[22px] rounded-full bg-surface shadow-sm" />
                </button>
              </div>

              {exactOn && (
                <div className="flex items-center justify-center gap-4 rounded-2xl bg-clay-soft p-3">
                  <Stepper
                    value={draft.exactHomeScore ?? 0}
                    onChange={(v) => onExactChange(v, draft.exactAwayScore ?? 0)}
                    label={fixture.homeTeam.shortName}
                  />
                  <span className="text-[18px] text-ink-faint">–</span>
                  <Stepper
                    value={draft.exactAwayScore ?? 0}
                    onChange={(v) => onExactChange(draft.exactHomeScore ?? 0, v)}
                    label={fixture.awayTeam.shortName}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-wrong-soft px-3 py-2 text-[12px] text-wrong">
          {error}
        </p>
      )}
    </div>
  );
}
