"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { answerBonusQuestion } from "@/lib/bonus/actions";
import { getKind } from "@/lib/bonus/registry";
import type { BonusQuestion, BonusAnswerRow } from "@/lib/bonus/types";

interface Props {
  question: BonusQuestion;
  existingAnswer: BonusAnswerRow | null;
}

function PodiumForm({ question, existingAnswer, onResult }: Props & { onResult: (r: { ok: boolean; text: string }) => void }) {
  const kd = getKind(question.kind)!;
  const config = question.config as { options: { value: string; label: string }[]; count: number; labels?: string[] };
  const count = config.count ?? 3;

  const existingPicks = (existingAnswer?.answer as { picks?: string[] } | null)?.picks ?? [];
  const [picks, setPicks] = useState<string[]>(
    existingPicks.length === count ? existingPicks : Array(count).fill(""),
  );
  const [pending, setPending] = useState(false);

  const labels = config.labels ?? Array.from({ length: count }, (_, i) => i === 0 ? "1er" : `${i + 1}e`);

  function updatePick(index: number, value: string) {
    const next = [...picks];
    next[index] = value;
    setPicks(next);
  }

  const allFilled = picks.every((p) => p !== "");
  const hasDuplicates = new Set(picks.filter(Boolean)).size !== picks.filter(Boolean).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allFilled || hasDuplicates) return;
    setPending(true);
    const result = await answerBonusQuestion({
      questionId: question.id,
      answer: { picks },
    });
    setPending(false);
    onResult({ ok: result.ok, text: result.message });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {picks.map((pick, i) => {
        const used = picks.filter((_, j) => j !== i);
        const available = config.options.filter((o) => !used.includes(o.value) || o.value === pick);
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-10 text-right text-[14px] font-bold text-ink-muted">
              {labels[i]}
            </span>
            <select
              value={pick}
              onChange={(e) => updatePick(i, e.target.value)}
              className={`flex-1 rounded-xl border-2 px-4 py-3 text-[14px] font-semibold transition ${
                pick
                  ? "border-clay bg-clay-soft text-clay"
                  : "border-line bg-surface text-ink"
              }`}
            >
              <option value="">— Choisir une equipe —</option>
              {available.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        );
      })}

      {hasDuplicates && (
        <p className="text-[13px] font-semibold text-wrong">
          Chaque equipe ne peut etre choisie qu'une fois.
        </p>
      )}

      <Button type="submit" disabled={pending || !allFilled || hasDuplicates}>
        {pending
          ? "Envoi…"
          : existingAnswer
            ? "Modifier ma reponse"
            : "Valider ma reponse"}
      </Button>
    </form>
  );
}

function SimpleForm({ question, existingAnswer, onResult }: Props & { onResult: (r: { ok: boolean; text: string }) => void }) {
  const kd = getKind(question.kind);
  const initial = existingAnswer
    ? String((existingAnswer.answer as { value: unknown })?.value ?? "")
    : "";
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(false);

  if (!kd) return <p className="text-[13px] text-ink-muted">Type de question inconnu.</p>;

  const fields = kd.answerFields(question.config);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value) return;
    setPending(true);

    const field = fields[0];
    let answer: unknown;
    if (field?.widget === "number") {
      answer = { value: parseInt(value, 10) };
    } else {
      answer = { value };
    }

    const result = await answerBonusQuestion({
      questionId: question.id,
      answer,
    });

    setPending(false);
    onResult({ ok: result.ok, text: result.message });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          {f.widget === "boolean" ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setValue("yes")}
                className={`flex-1 rounded-xl border-2 px-4 py-3 text-center text-[15px] font-bold transition ${
                  value === "yes"
                    ? "border-clay bg-clay-soft text-clay"
                    : "border-line bg-surface text-ink hover:bg-surface-sunk"
                }`}
              >
                {f.trueLabel}
              </button>
              <button
                type="button"
                onClick={() => setValue("no")}
                className={`flex-1 rounded-xl border-2 px-4 py-3 text-center text-[15px] font-bold transition ${
                  value === "no"
                    ? "border-clay bg-clay-soft text-clay"
                    : "border-line bg-surface text-ink hover:bg-surface-sunk"
                }`}
              >
                {f.falseLabel}
              </button>
            </div>
          ) : f.widget === "choice" ? (
            <div className="flex flex-col gap-1.5">
              {f.options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setValue(o.value)}
                  className={`rounded-xl border-2 px-4 py-3 text-left text-[14px] font-semibold transition ${
                    value === o.value
                      ? "border-clay bg-clay-soft text-clay"
                      : "border-line bg-surface text-ink hover:bg-surface-sunk"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                min={f.min}
                max={f.max}
                step={f.step}
                placeholder={f.label}
                className="w-full rounded-xl border-2 border-line bg-surface px-4 py-3 text-center text-[18px] font-bold text-ink placeholder:text-ink-faint"
              />
              {f.unit && <span className="text-[14px] text-ink-muted">{f.unit}</span>}
            </div>
          )}
        </div>
      ))}

      <Button type="submit" disabled={pending || !value}>
        {pending
          ? "Envoi…"
          : existingAnswer
            ? "Modifier ma reponse"
            : "Valider ma reponse"}
      </Button>
    </form>
  );
}

export function AnswerForm({ question, existingAnswer }: Props) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="flex flex-col gap-2">
      {question.kind === "podium" ? (
        <PodiumForm question={question} existingAnswer={existingAnswer} onResult={setMsg} />
      ) : (
        <SimpleForm question={question} existingAnswer={existingAnswer} onResult={setMsg} />
      )}
      {msg && (
        <p className={`text-[13px] font-semibold ${msg.ok ? "text-winner" : "text-wrong"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
