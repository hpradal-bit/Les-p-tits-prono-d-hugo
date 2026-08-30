"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { updateBonusQuestion } from "@/lib/bonus/actions";
import type { BonusQuestion } from "@/lib/bonus/types";

interface TeamOption {
  value: string;
  label: string;
}

interface RoundOption {
  id: string;
  name: string;
  number: number;
}

/** `datetime-local` veut une chaîne locale sans fuseau : YYYY-MM-DDTHH:mm. */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Édition d'une question déjà créée. Réutilise exactement les mêmes formes
 * de barème/config que `create-form.tsx` — rien n'est réinventé, seulement
 * pré-rempli. Les options et le barème se verrouillent d'eux-mêmes dès que
 * des joueurs ont répondu ou que la question est réglée (voir
 * `updateBonusQuestion`, qui applique la même règle côté serveur).
 */
export function EditQuestionForm({
  question,
  teams,
  rounds,
  answerCount,
  onDone,
}: {
  question: BonusQuestion;
  teams: TeamOption[];
  rounds: RoundOption[];
  answerCount: number;
  onDone: () => void;
}) {
  const isPodium = question.kind === "podium";
  const isChoice = question.kind === "single_choice";
  const isNumeric = question.kind === "numeric_closest";
  const hasAnswers = answerCount > 0;
  const scoringLocked = question.status === "settled";

  const [prompt, setPrompt] = useState(question.prompt);
  const [roundId, setRoundId] = useState(question.roundId ?? "");
  const [closesAt, setClosesAt] = useState(toLocalInputValue(question.closesAt));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const scoring = (question.scoring ?? {}) as Record<string, number>;
  const [ptsCorrect, setPtsCorrect] = useState(scoring.correct ?? 3);
  const [ptsExact, setPtsExact] = useState(scoring.exact_position ?? 5);
  const [ptsPodium, setPtsPodium] = useState(scoring.in_podium ?? 2);
  const [ptsClosestExact, setPtsClosestExact] = useState(scoring.exact ?? 5);
  const [ptsClosest, setPtsClosest] = useState(scoring.closest ?? 3);

  const cfg = (question.config ?? {}) as {
    options?: { value: string; label: string }[];
    count?: number;
    rankFrom?: "top" | "bottom";
  };
  const [options, setOptions] = useState<{ value: string; label: string }[]>(
    cfg.options ?? [],
  );
  const [count, setCount] = useState(cfg.count ?? 3);
  const [rankFrom, setRankFrom] = useState<"top" | "bottom">(cfg.rankFrom ?? "top");

  function updateOptionLabel(i: number, label: string) {
    const next = [...options];
    next[i] = { ...next[i], label };
    setOptions(next);
  }
  function addOption() {
    const id = String.fromCharCode(97 + options.length);
    setOptions([...options, { value: id, label: "" }]);
  }
  function removeOption(i: number) {
    if (options.length <= 2) return;
    setOptions(options.filter((_, j) => j !== i));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setPending(true);
    setMessage(null);

    const payload: Record<string, unknown> = {
      questionId: question.id,
      prompt: prompt.trim(),
      roundId: roundId || null,
      closesAt: closesAt ? new Date(closesAt).toISOString() : null,
    };

    if (isPodium) {
      if (!hasAnswers) {
        payload.config = {
          options: teams,
          count,
          ...(rankFrom === "bottom" ? { rankFrom: "bottom" } : {}),
        };
      }
      if (!scoringLocked) payload.scoring = { exact_position: ptsExact, in_podium: ptsPodium };
    } else if (isChoice) {
      if (!hasAnswers) {
        const validOptions = options.filter((o) => o.label.trim());
        if (validOptions.length < 2) {
          setMessage({ ok: false, text: "Il faut au moins 2 options." });
          setPending(false);
          return;
        }
        payload.config = {
          options: validOptions.map((o, i) => ({
            value: String.fromCharCode(97 + i),
            label: o.label.trim(),
          })),
        };
      }
      if (!scoringLocked) payload.scoring = { correct: ptsCorrect };
    } else if (isNumeric) {
      if (!scoringLocked) payload.scoring = { exact: ptsClosestExact, closest: ptsClosest };
    } else if (!scoringLocked) {
      payload.scoring = { correct: ptsCorrect };
    }

    const result = await updateBonusQuestion(payload);
    setPending(false);
    setMessage({ ok: result.status === "success", text: result.message ?? "Fait." });
    if (result.status === "success") onDone();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 flex flex-col gap-3 rounded-lg border border-line bg-surface-sunk p-3"
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-[12.5px] font-semibold text-ink">Intitulé</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          maxLength={500}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink"
        />
      </div>

      {rounds.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[12.5px] font-semibold text-ink">Journée</label>
          <select
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink"
          >
            <option value="">Saison entière</option>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-[12.5px] font-semibold text-ink">Date et heure de fin</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink"
          />
          {closesAt && (
            <button
              type="button"
              onClick={() => setClosesAt("")}
              className="text-[12.5px] text-ink-muted hover:underline"
            >
              Retirer
            </button>
          )}
        </div>
        <p className="text-[11.5px] text-ink-faint">
          {closesAt
            ? "Les réponses seront bloquées après cette date."
            : "Sans date de fin, la question reste ouverte jusqu'à fermeture manuelle."}
        </p>
      </div>

      {isChoice && (
        <div className="flex flex-col gap-2">
          <label className="text-[12.5px] font-semibold text-ink">Options de réponse</label>
          {hasAnswers ? (
            <p className="text-[11.5px] text-ink-faint">
              Verrouillées : des joueurs ont déjà répondu.
            </p>
          ) : (
            <>
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt.label}
                    onChange={(e) => updateOptionLabel(i, e.target.value)}
                    className="flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-[13.5px] text-ink"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="text-[12.5px] text-wrong hover:underline"
                    >
                      Retirer
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addOption}
                className="self-start text-[12.5px] font-semibold text-clay hover:underline"
              >
                + Ajouter une option
              </button>
            </>
          )}
        </div>
      )}

      {isPodium && (
        <div className="flex flex-col gap-2">
          <label className="text-[12.5px] font-semibold text-ink">Configuration du podium</label>
          {hasAnswers ? (
            <p className="text-[11.5px] text-ink-faint">
              Verrouillée : des joueurs ont déjà répondu.
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <select
                value={rankFrom}
                onChange={(e) => setRankFrom(e.target.value as "top" | "bottom")}
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-[13.5px] text-ink"
              >
                <option value="top">Les premiers</option>
                <option value="bottom">Les derniers</option>
              </select>
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-[13.5px] text-ink"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-[12.5px] font-semibold text-ink">Barème</label>
        {scoringLocked ? (
          <p className="text-[11.5px] text-ink-faint">
            Verrouillé : la question est déjà réglée, les points sont distribués.
          </p>
        ) : isPodium ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label className="flex-1 text-[12.5px] text-ink-muted">Bonne place</label>
              <input
                type="number" min={0} max={20} value={ptsExact}
                onChange={(e) => setPtsExact(Number(e.target.value))}
                className="w-16 rounded-md border border-line bg-surface px-2 py-1 text-center text-[13.5px] font-bold text-ink"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex-1 text-[12.5px] text-ink-muted">Présente, mal placée</label>
              <input
                type="number" min={0} max={20} value={ptsPodium}
                onChange={(e) => setPtsPodium(Number(e.target.value))}
                className="w-16 rounded-md border border-line bg-surface px-2 py-1 text-center text-[13.5px] font-bold text-ink"
              />
            </div>
          </div>
        ) : isNumeric ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <label className="flex-1 text-[12.5px] text-ink-muted">Réponse exacte</label>
              <input
                type="number" min={0} max={20} value={ptsClosestExact}
                onChange={(e) => setPtsClosestExact(Number(e.target.value))}
                className="w-16 rounded-md border border-line bg-surface px-2 py-1 text-center text-[13.5px] font-bold text-ink"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="flex-1 text-[12.5px] text-ink-muted">Le plus proche</label>
              <input
                type="number" min={0} max={20} value={ptsClosest}
                onChange={(e) => setPtsClosest(Number(e.target.value))}
                className="w-16 rounded-md border border-line bg-surface px-2 py-1 text-center text-[13.5px] font-bold text-ink"
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <label className="flex-1 text-[12.5px] text-ink-muted">Bonne réponse</label>
            <input
              type="number" min={0} max={20} value={ptsCorrect}
              onChange={(e) => setPtsCorrect(Number(e.target.value))}
              className="w-16 rounded-md border border-line bg-surface px-2 py-1 text-center text-[13.5px] font-bold text-ink"
            />
          </div>
        )}
      </div>

      {message && (
        <p className={`text-[12.5px] font-semibold ${message.ok ? "text-winner" : "text-wrong"}`}>
          {message.text}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending || !prompt.trim()}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
