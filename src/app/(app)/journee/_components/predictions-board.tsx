"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bucketFor, outcomeOf } from "@/lib/scoring";
import { saveRoundPredictions } from "@/lib/predictions/actions";
import { exactScoreVerdict, monthKeyOf, type ExactAttempt } from "@/lib/predictions/exact-score";
import type { JourneyFixture, PredictionDraft } from "@/lib/predictions/types";
import type { MatchOutcome, Ruleset, Uuid } from "@/lib/types";
import { EditableMatchCard } from "./editable-match-card";

/** Le temps d'inactivité avant d'enregistrer un ajustement de score exact —
 *  évite un appel réseau à chaque incrément de +1 / -1 sur les steppers. */
const EXACT_SCORE_SAVE_DELAY_MS = 500;

function draftOf(item: JourneyFixture): PredictionDraft {
  return (
    item.draft ?? {
      outcome: null,
      marginBucketId: null,
      marginValue: null,
      exactHomeScore: null,
      exactAwayScore: null,
    }
  );
}

/**
 * Les matchs encore ouverts de « Ma journée », pronostiquables sur place.
 *
 * Tout l'état d'édition vit ici, au-dessus des cartes : c'est ce qui permet
 * au budget de score exact de la journée (partagé entre tous les matchs
 * ouverts) de se recalculer en direct pendant que le joueur passe de l'un à
 * l'autre, sans repasser par le serveur à chaque geste — exactement le
 * comportement déjà documenté pour `otherAttempts` dans `loadJourneyBoard`.
 */
export function PredictionsBoard({
  fixtures,
  ruleset,
  timeZone,
  roundId,
  seasonId,
  otherAttempts,
}: {
  fixtures: JourneyFixture[];
  ruleset: Ruleset;
  timeZone: string;
  roundId: Uuid;
  seasonId: Uuid;
  otherAttempts: ExactAttempt[];
}) {
  const [drafts, setDrafts] = useState<Record<Uuid, PredictionDraft>>(() =>
    Object.fromEntries(fixtures.map((f) => [f.fixture.id, draftOf(f)])),
  );
  const [expandedId, setExpandedId] = useState<Uuid | null>(null);
  const [savingId, setSavingId] = useState<Uuid | null>(null);
  const [errors, setErrors] = useState<Record<Uuid, string>>({});
  const saveTimers = useRef<Record<Uuid, ReturnType<typeof setTimeout>>>({});
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
      for (const timer of Object.values(saveTimers.current)) clearTimeout(timer);
    },
    [],
  );

  // Le budget de score exact de la journée, recalculé à chaque geste à partir
  // des brouillons en cours — fonction pure déjà utilisée côté serveur, on ne
  // réinvente rien : voir src/lib/predictions/exact-score.ts.
  const currentRoundAttempts = useMemo<ExactAttempt[]>(
    () =>
      fixtures
        .filter((f) => drafts[f.fixture.id]?.exactHomeScore !== null)
        .map((f) => ({
          fixtureId: f.fixture.id,
          roundId,
          seasonId,
          monthKey: monthKeyOf(f.fixture.kickoffAt, timeZone),
        })),
    [fixtures, drafts, roundId, seasonId, timeZone],
  );

  const allAttempts = useMemo(
    () => [...otherAttempts, ...currentRoundAttempts],
    [otherAttempts, currentRoundAttempts],
  );

  const persist = useCallback(
    (fixtureId: Uuid, draft: PredictionDraft) => {
      if (draft.outcome === null) return;
      setSavingId(fixtureId);
      setErrors((prev) => {
        if (!(fixtureId in prev)) return prev;
        const next = { ...prev };
        delete next[fixtureId];
        return next;
      });
      saveRoundPredictions({
        roundId,
        predictions: [
          {
            fixtureId,
            outcome: draft.outcome,
            marginBucketId: draft.marginBucketId,
            marginValue: null,
            exactHomeScore: draft.exactHomeScore,
            exactAwayScore: draft.exactAwayScore,
          },
        ],
      }).then((result) => {
        if (!mountedRef.current) return;
        setSavingId((current) => (current === fixtureId ? null : current));
        if (!result.ok) {
          setErrors((prev) => ({ ...prev, [fixtureId]: result.rejected[fixtureId] ?? result.message }));
        }
      });
    },
    [roundId],
  );

  /** Enregistrement immédiat : un choix de vainqueur, de tranche, ou l'interrupteur du score exact. */
  const persistNow = useCallback(
    (fixtureId: Uuid, draft: PredictionDraft) => {
      const pending = saveTimers.current[fixtureId];
      if (pending) {
        clearTimeout(pending);
        delete saveTimers.current[fixtureId];
      }
      persist(fixtureId, draft);
    },
    [persist],
  );

  /** Enregistrement différé : les steppers du score exact, ajustés à répétition. */
  const persistDebounced = useCallback(
    (fixtureId: Uuid, draft: PredictionDraft) => {
      const pending = saveTimers.current[fixtureId];
      if (pending) clearTimeout(pending);
      saveTimers.current[fixtureId] = setTimeout(() => {
        delete saveTimers.current[fixtureId];
        persist(fixtureId, draft);
      }, EXACT_SCORE_SAVE_DELAY_MS);
    },
    [persist],
  );

  function updateDraft(fixtureId: Uuid, patch: Partial<PredictionDraft>, immediate: boolean) {
    setDrafts((prev) => {
      const next = { ...prev, [fixtureId]: { ...prev[fixtureId], ...patch } };
      if (immediate) persistNow(fixtureId, next[fixtureId]);
      else persistDebounced(fixtureId, next[fixtureId]);
      return next;
    });
  }

  function handlePickOutcome(fixtureId: Uuid, outcome: MatchOutcome) {
    // Choisir un vainqueur à la main referme le score exact : les deux modes
    // de saisie de l'écart ne se mélangent pas, comme sur l'ancien formulaire.
    // Un match nul n'a pas d'écart à parier : l'écart d'un nul est toujours
    // nul par définition, la tranche choisie n'a donc plus de sens.
    updateDraft(
      fixtureId,
      {
        outcome,
        exactHomeScore: null,
        exactAwayScore: null,
        ...(outcome === "draw" ? { marginBucketId: null } : {}),
      },
      true,
    );
  }

  function handlePickBucket(fixtureId: Uuid, bucketId: Uuid) {
    updateDraft(fixtureId, { marginBucketId: bucketId }, true);
  }

  function handleToggleExact(fixtureId: Uuid, on: boolean) {
    if (!on) {
      updateDraft(fixtureId, { exactHomeScore: null, exactAwayScore: null }, true);
      return;
    }
    // Des scores rugby plausibles par défaut, comme sur l'ancien formulaire.
    applyExactScore(fixtureId, 20, 15, true);
  }

  function handleExactChange(fixtureId: Uuid, home: number, away: number) {
    applyExactScore(fixtureId, home, away, false);
  }

  /** Le score exact commande : le vainqueur et la tranche s'en déduisent toujours. */
  function applyExactScore(fixtureId: Uuid, home: number, away: number, immediate: boolean) {
    const derived = bucketFor(Math.abs(home - away), ruleset.buckets);
    updateDraft(
      fixtureId,
      {
        outcome: outcomeOf({ homeScore: home, awayScore: away }),
        exactHomeScore: home,
        exactAwayScore: away,
        marginBucketId: derived?.id ?? null,
      },
      immediate,
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {fixtures.map((item) => {
        const draft = drafts[item.fixture.id];
        const verdict = exactScoreVerdict(ruleset, allAttempts, {
          fixtureId: item.fixture.id,
          roundId,
          seasonId,
          monthKey: item.monthKey,
        });
        return (
          <div key={item.fixture.id} id={`fixture-${item.fixture.id}`} className="scroll-mt-24">
            <EditableMatchCard
              item={item}
              ruleset={ruleset}
              timeZone={timeZone}
              draft={draft}
              verdict={verdict}
              expanded={expandedId === item.fixture.id}
              onToggleExpand={() =>
                setExpandedId((current) => (current === item.fixture.id ? null : item.fixture.id))
              }
              onPickOutcome={(outcome) => handlePickOutcome(item.fixture.id, outcome)}
              onPickBucket={(bucketId) => handlePickBucket(item.fixture.id, bucketId)}
              onToggleExact={(on) => handleToggleExact(item.fixture.id, on)}
              onExactChange={(home, away) => handleExactChange(item.fixture.id, home, away)}
              saving={savingId === item.fixture.id}
              error={errors[item.fixture.id]}
            />
          </div>
        );
      })}
    </div>
  );
}
