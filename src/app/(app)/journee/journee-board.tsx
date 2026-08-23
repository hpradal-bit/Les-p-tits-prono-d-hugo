"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { saveRoundPredictions, type SaveOutcome } from "@/lib/predictions/actions";
import {
  exactScoreBudget,
  exactScoreSentence,
  exactScoreVerdict,
  type ExactAttempt,
} from "@/lib/predictions/exact-score";
import { formatCountdown, isLockedAt, msUntil } from "@/lib/predictions/lock";
import type { JourneyBoard, PredictionDraft } from "@/lib/predictions/types";
import { EMPTY_DRAFT, FixtureCard } from "./fixture-card";

/* ---------------------------------------------------------------------------
   L'écran de jeu.

   Objectif tenu à l'œil : une journée complète en moins de 60 secondes sur
   mobile. Donc — les sept matchs sur un seul écran, aucune navigation, aucun
   aller-retour réseau pendant la saisie, et un seul bouton à la fin.

   L'horloge : le serveur envoie son heure, on en déduit le décalage du
   navigateur et on s'en sert pour les comptes à rebours. Une horloge de
   téléphone mal réglée ne change donc rien à l'affichage — et de toute façon
   rien du tout à l'autorisation, qui est prononcée par la base.
   --------------------------------------------------------------------------- */

function sameDraft(a: PredictionDraft, b: PredictionDraft) {
  return (
    a.outcome === b.outcome &&
    a.marginBucketId === b.marginBucketId &&
    a.marginValue === b.marginValue &&
    a.exactHomeScore === b.exactHomeScore &&
    a.exactAwayScore === b.exactAwayScore
  );
}

export function JourneeBoard({ board }: { board: JourneyBoard }) {
  const initial = useMemo(() => {
    const map: Record<string, PredictionDraft> = {};
    for (const item of board.fixtures) {
      map[item.fixture.id] = item.draft ?? { ...EMPTY_DRAFT };
    }
    return map;
  }, [board.fixtures]);

  const [drafts, setDrafts] = useState<Record<string, PredictionDraft>>(initial);
  const [outcome, setOutcome] = useState<SaveOutcome | null>(null);
  const [pending, startTransition] = useTransition();

  // Le compte à rebours part de l'heure du serveur. Le décalage de l'horloge du
  // navigateur est mesuré une fois, puis corrigé à chaque battement : un
  // téléphone mal réglé n'affiche donc pas un verrouillage faux.
  // (La page est rendue à chaque visite, `key` sur la journée : pas de dérive.)
  const [now, setNow] = useState(() => Date.parse(board.serverNow));

  useEffect(() => {
    const offset = Date.parse(board.serverNow) - Date.now();
    const id = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [board.serverNow]);

  const { ruleset } = board;

  /* --- Ce qui est verrouillé, maintenant ---------------------------------- */
  const lockedNow = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const item of board.fixtures) {
      map[item.fixture.id] = item.isLocked || isLockedAt(item.fixture.locksAt, now);
    }
    return map;
  }, [board.fixtures, now]);

  /* --- Le quota de scores exacts, recalculé à chaque frappe ---------------- */
  const attempts: ExactAttempt[] = useMemo(() => {
    const fromThisRound = board.fixtures
      .filter((item) => {
        const d = drafts[item.fixture.id];
        return d != null && (d.exactHomeScore !== null || d.exactAwayScore !== null);
      })
      .map((item) => ({
        fixtureId: item.fixture.id,
        roundId: board.round.id,
        seasonId: board.seasonId,
        monthKey: item.monthKey,
      }));
    return [...board.otherAttempts, ...fromThisRound];
  }, [board, drafts]);

  const budget = useMemo(() => {
    const first = board.fixtures[0];
    return exactScoreBudget(ruleset, attempts, {
      fixtureId: first?.fixture.id ?? "",
      roundId: board.round.id,
      seasonId: board.seasonId,
      monthKey: first?.monthKey ?? "",
    });
  }, [ruleset, attempts, board]);

  /* --- Compteurs ----------------------------------------------------------- */
  const openFixtures = board.fixtures.filter((i) => !lockedNow[i.fixture.id]);
  const remaining = openFixtures.filter(
    (i) => (drafts[i.fixture.id]?.outcome ?? null) === null,
  ).length;

  const dirty = board.fixtures.filter((item) => {
    if (lockedNow[item.fixture.id]) return false;
    const d = drafts[item.fixture.id];
    if (!d || d.outcome === null) return false;
    const before = item.draft;
    return before === null || !sameDraft(before, d);
  });

  // Un score exact à moitié saisi n'est pas envoyable : le serveur le refuserait,
  // autant le dire tout de suite.
  const incomplete = board.fixtures.filter((item) => {
    if (lockedNow[item.fixture.id]) return false;
    const d = drafts[item.fixture.id];
    return d != null && (d.exactHomeScore === null) !== (d.exactAwayScore === null);
  });

  const nextLockMs = openFixtures.length
    ? Math.min(...openFixtures.map((i) => msUntil(i.fixture.locksAt, now)))
    : null;

  /* --- Enregistrement ------------------------------------------------------ */
  function save() {
    if (dirty.length === 0 || incomplete.length > 0 || pending) return;
    const payload = {
      roundId: board.round.id,
      predictions: dirty.map((item) => {
        const d = drafts[item.fixture.id];
        return {
          fixtureId: item.fixture.id,
          outcome: d.outcome!,
          marginBucketId: d.marginBucketId,
          marginValue: d.marginValue,
          exactHomeScore: d.exactHomeScore,
          exactAwayScore: d.exactAwayScore,
        };
      }),
    };

    startTransition(async () => {
      setOutcome(await saveRoundPredictions(payload));
    });
  }

  const allPlayed = remaining === 0 && openFixtures.length > 0;

  return (
    <div className="flex flex-col gap-3 pb-28">
      {/* --- Bandeau de progression, collé en haut ---------------------------- */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-line bg-ground/92 px-4 py-2 backdrop-blur">
        <div className="flex items-baseline justify-between gap-3">
          <p
            className={cn(
              "font-display text-[15px]",
              allPlayed ? "text-clay" : "text-ink",
            )}
          >
            {openFixtures.length === 0
              ? "Journée verrouillée"
              : allPlayed
                ? "Journée complète 🎉"
                : `Il te reste ${remaining} prono${remaining > 1 ? "s" : ""}`}
          </p>
          {nextLockMs !== null && nextLockMs > 0 && (
            <p className="tabular font-mono text-[11px] text-ink-muted">
              🔒 {formatCountdown(nextLockMs)}
            </p>
          )}
        </div>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
          {exactScoreSentence(budget)}
        </p>
      </div>

      {/* --- Les matchs -------------------------------------------------------- */}
      {board.fixtures.map((item) => {
        const draft = drafts[item.fixture.id] ?? EMPTY_DRAFT;
        const verdict = exactScoreVerdict(ruleset, attempts, {
          fixtureId: item.fixture.id,
          roundId: board.round.id,
          seasonId: board.seasonId,
          monthKey: item.monthKey,
        });

        return (
          <FixtureCard
            key={item.fixture.id}
            item={item}
            draft={draft}
            buckets={ruleset.buckets}
            marginMode={ruleset.marginMode}
            tolerance={ruleset.marginDistanceTolerance}
            timeZone={board.timeZone}
            now={now}
            locked={lockedNow[item.fixture.id]}
            exactAllowed={verdict.allowed}
            exactReason={
              verdict.eligible
                ? verdict.disabled
                  ? "Score exact désactivé"
                  : "Quota épuisé"
                : "Match non autorisé"
            }
            error={outcome?.rejected[item.fixture.id]}
            onChange={(next) =>
              setDrafts((prev) => ({ ...prev, [item.fixture.id]: next }))
            }
          />
        );
      })}

      {/* --- La barre d'enregistrement, collée en bas -------------------------- */}
      {openFixtures.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ground/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1">
              {outcome ? (
                <p
                  className={cn(
                    "truncate text-[13px]",
                    outcome.ok ? "text-winner" : "text-wrong",
                  )}
                  role="status"
                >
                  {outcome.ok ? "✓ " : "⚠ "}
                  {outcome.message}
                </p>
              ) : (
                <p
                  className={cn(
                    "truncate font-mono text-[11px]",
                    incomplete.length > 0 ? "text-sage" : "text-ink-faint",
                  )}
                >
                  {incomplete.length > 0
                    ? "Score exact incomplet"
                    : dirty.length === 0
                      ? "Rien à enregistrer"
                      : `${dirty.length} match${dirty.length > 1 ? "s" : ""} à envoyer`}
                </p>
              )}
            </div>
            <Button
              type="button"
              onClick={save}
              disabled={dirty.length === 0 || incomplete.length > 0 || pending}
              className="shrink-0"
            >
              {pending ? "Envoi…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
