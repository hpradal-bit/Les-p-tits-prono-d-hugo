"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { answerBonusQuestion } from "@/lib/bonus/actions";
import { getKind } from "@/lib/bonus/registry";
import { isAnswerable } from "@/lib/bonus/types";
import type { BonusQuestion, BonusAnswerRow } from "@/lib/bonus/types";

interface BonusItem {
  question: BonusQuestion;
  myAnswer: BonusAnswerRow | null;
}

function Countdown({ closesAt }: { closesAt: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    function tick() {
      const diff = new Date(closesAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Termine");
        return;
      }
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff % 86_400_000) / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      if (d > 0) setRemaining(`${d}j ${h}h`);
      else if (h > 0) setRemaining(`${h}h ${m}min`);
      else setRemaining(`${m}min`);
    }
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [closesAt]);

  return <span>{remaining}</span>;
}

function MiniAnswerForm({ item }: { item: BonusItem }) {
  const { question, myAnswer } = item;
  const kd = getKind(question.kind);
  const canAnswer = isAnswerable(question);

  const [value, setValue] = useState(
    myAnswer ? String((myAnswer.answer as { value?: unknown })?.value ?? "") : "",
  );
  const [picks, setPicks] = useState<string[]>(() => {
    if (question.kind !== "podium") return [];
    const existing = (myAnswer?.answer as { picks?: string[] } | null)?.picks;
    const config = question.config as { count?: number };
    const count = config.count ?? 3;
    return existing?.length === count ? existing : Array(count).fill("");
  });
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!kd) return null;

  if (!canAnswer) {
    if (myAnswer) {
      return (
        <p className="text-[13px] text-ink-muted">
          Ta reponse : <strong>{kd.formatAnswer(myAnswer.answer, question.config)}</strong>
        </p>
      );
    }
    return <p className="text-[13px] text-ink-faint">Delai depasse</p>;
  }

  async function submit(answer: unknown) {
    setPending(true);
    setMsg(null);
    const result = await answerBonusQuestion({
      questionId: question.id,
      answer,
    });
    setPending(false);
    setMsg({ ok: result.ok, text: result.message });
  }

  if (question.kind === "podium") {
    const config = question.config as { options: { value: string; label: string }[]; count: number };
    const count = config.count ?? 3;
    const labels = Array.from({ length: count }, (_, i) => i === 0 ? "1er" : `${i + 1}e`);
    const allFilled = picks.every((p) => p !== "");
    const hasDuplicates = new Set(picks.filter(Boolean)).size !== picks.filter(Boolean).length;

    function updatePick(i: number, v: string) {
      const next = [...picks];
      next[i] = v;
      setPicks(next);
    }

    return (
      <div className="flex flex-col gap-2">
        {picks.map((pick, i) => {
          const used = picks.filter((_, j) => j !== i);
          const available = config.options.filter((o) => !used.includes(o.value) || o.value === pick);
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="w-8 text-right text-[12px] font-bold text-ink-muted">{labels[i]}</span>
              <select
                value={pick}
                onChange={(e) => updatePick(i, e.target.value)}
                className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-semibold transition ${
                  pick
                    ? "border-clay bg-clay-soft text-clay"
                    : "border-line bg-surface text-ink"
                }`}
              >
                <option value="">— Choisir —</option>
                {available.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          );
        })}
        {hasDuplicates && (
          <p className="text-[11px] font-semibold text-wrong">
            Chaque équipe ne peut être choisie qu&apos;une fois.
          </p>
        )}
        <Button
          size="sm"
          disabled={pending || !allFilled || hasDuplicates}
          onClick={() => submit({ picks })}
        >
          {pending ? "Envoi…" : myAnswer ? "Modifier" : "Valider"}
        </Button>
        {msg && (
          <p className={`text-[11px] font-semibold ${msg.ok ? "text-winner" : "text-wrong"}`}>{msg.text}</p>
        )}
      </div>
    );
  }

  const fields = kd.answerFields(question.config);
  const field = fields[0];
  if (!field) return null;

  return (
    <div className="flex flex-col gap-2">
      {field.widget === "boolean" ? (
        <div className="flex gap-2">
          {[
            { v: "yes", label: field.trueLabel },
            { v: "no", label: field.falseLabel },
          ].map(({ v, label }) => (
            <button
              key={v}
              type="button"
              onClick={() => setValue(v)}
              className={`flex-1 rounded-lg border-2 px-3 py-2 text-center text-[13px] font-bold transition ${
                value === v
                  ? "border-clay bg-clay-soft text-clay"
                  : "border-line bg-surface text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : field.widget === "choice" ? (
        <div className="flex flex-col gap-1">
          {field.options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setValue(o.value)}
              className={`rounded-lg border-2 px-3 py-2 text-left text-[13px] font-semibold transition ${
                value === o.value
                  ? "border-clay bg-clay-soft text-clay"
                  : "border-line bg-surface text-ink"
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
            min={field.min}
            max={field.max}
            step={field.step}
            placeholder={field.label}
            className="w-full rounded-lg border-2 border-line bg-surface px-3 py-2 text-center text-[16px] font-bold text-ink placeholder:text-ink-faint"
          />
          {field.unit && <span className="text-[13px] text-ink-muted">{field.unit}</span>}
        </div>
      )}
      <Button
        size="sm"
        disabled={pending || !value}
        onClick={() => {
          const answer = field.widget === "number"
            ? { value: parseInt(value, 10) }
            : { value };
          submit(answer);
        }}
      >
        {pending ? "Envoi…" : myAnswer ? "Modifier" : "Valider"}
      </Button>
      {msg && (
        <p className={`text-[11px] font-semibold ${msg.ok ? "text-winner" : "text-wrong"}`}>{msg.text}</p>
      )}
    </div>
  );
}

export function BonusBanner({ items, leagueId }: { items: BonusItem[]; leagueId: string }) {
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[18px]">🎯</span>
        <h2 className="text-[14px] font-bold text-ink">Questions bonus</h2>
        <Link
          href={`/questions?league=${leagueId}`}
          className="ml-auto text-[12px] font-semibold text-clay hover:underline"
        >
          Tout voir
        </Link>
      </div>

      {items.map(({ question, myAnswer }) => {
        const answered = !!myAnswer;
        return (
          <div
            key={question.id}
            className={`rounded-[var(--radius-card)] border bg-surface p-3 shadow-[var(--shadow-card)] ${
              answered ? "border-winner/30" : "border-clay"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[14px] font-semibold text-ink">{question.prompt}</p>
              {answered && (
                <span className="shrink-0 rounded-full bg-winner-soft px-2 py-0.5 text-[10px] font-bold text-winner">
                  Repondu
                </span>
              )}
            </div>

            {question.closesAt && (
              <p className="mt-1 text-[11px] text-ink-faint">
                Temps restant : <Countdown closesAt={question.closesAt} />
              </p>
            )}

            <div className="mt-2">
              <MiniAnswerForm item={{ question, myAnswer }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
