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

export function AnswerForm({ question, existingAnswer }: Props) {
  const kd = getKind(question.kind);
  const initial = existingAnswer
    ? String((existingAnswer.answer as { value: unknown })?.value ?? "")
    : "";
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!kd) return <p className="text-[13px] text-ink-muted">Type de question inconnu.</p>;

  const fields = kd.answerFields(question.config);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value) return;
    setPending(true);
    setMsg(null);

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
    setMsg({ ok: result.ok, text: result.message });
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

      {msg && (
        <p className={`text-[13px] font-semibold ${msg.ok ? "text-winner" : "text-wrong"}`}>
          {msg.text}
        </p>
      )}

      <Button type="submit" disabled={pending || !value}>
        {pending
          ? "Envoi…"
          : existingAnswer
            ? "Modifier ma réponse"
            : "Valider ma réponse"}
      </Button>
    </form>
  );
}
