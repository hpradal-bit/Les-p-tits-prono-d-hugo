"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import {
  openBonusQuestion,
  closeBonusQuestion,
  settleBonusQuestion,
  settleBonusFromStandings,
  deleteBonusQuestion,
} from "@/lib/bonus/actions";
import { getKind } from "@/lib/bonus/registry";
import type { BonusQuestion } from "@/lib/bonus/types";
import { EditQuestionForm } from "./edit-form";

function PodiumSettleForm({ question }: { question: BonusQuestion }) {
  const config = question.config as { options: { value: string; label: string }[]; count: number; labels?: string[] };
  const count = config.count ?? 3;
  const labels = config.labels ?? Array.from({ length: count }, (_, i) => i === 0 ? "1er" : `${i + 1}e`);

  const [picks, setPicks] = useState<string[]>(Array(count).fill(""));
  const [pending, setPending] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [msg, setMsg] = useState("");

  function updatePick(i: number, v: string) {
    const next = [...picks];
    next[i] = v;
    setPicks(next);
  }

  const allFilled = picks.every((p) => p !== "");

  async function handleSettle(e: React.FormEvent) {
    e.preventDefault();
    if (!allFilled) return;
    setPending(true);
    setMsg("");
    const result = await settleBonusQuestion({
      questionId: question.id,
      correctAnswer: { picks },
    });
    setPending(false);
    setMsg(result.message ?? "");
  }

  async function handleAutoSettle() {
    setAutoLoading(true);
    setMsg("");
    const result = await settleBonusFromStandings(question.id);
    setAutoLoading(false);
    setMsg(result.message ?? "");
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <Button size="sm" variant="primary" onClick={handleAutoSettle} disabled={autoLoading}>
        {autoLoading ? "Chargement…" : "Regler depuis le classement"}
      </Button>
      <details className="text-[12px] text-ink-muted">
        <summary className="cursor-pointer font-semibold">Ou saisir manuellement</summary>
        <form onSubmit={handleSettle} className="mt-2 flex flex-col gap-2">
          {picks.map((pick, i) => {
            const used = picks.filter((_, j) => j !== i);
            const available = config.options.filter((o) => !used.includes(o.value) || o.value === pick);
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-8 text-right text-[12px] font-bold text-ink-muted">{labels[i]}</span>
                <select
                  value={pick}
                  onChange={(e) => updatePick(i, e.target.value)}
                  className="flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink"
                >
                  <option value="">—</option>
                  {available.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            );
          })}
          <Button type="submit" size="sm" variant="ghost" disabled={pending || !allFilled}>
            {pending ? "…" : "Regler manuellement"}
          </Button>
        </form>
      </details>
      {msg && <p className="text-[12px] font-semibold text-ink-muted">{msg}</p>}
    </div>
  );
}

function SimpleSettleForm({ question }: { question: BonusQuestion }) {
  const kd = getKind(question.kind);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState("");

  if (!kd) return null;

  const fields = kd.correctFields(question.config);

  async function handleSettle(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMsg("");

    let correctAnswer: unknown;
    const field = fields[0];
    if (!field) return;

    if (field.widget === "boolean") {
      correctAnswer = { value };
    } else if (field.widget === "number") {
      correctAnswer = { value: parseInt(value, 10) };
    } else {
      correctAnswer = { value };
    }

    const result = await settleBonusQuestion({
      questionId: question.id,
      correctAnswer,
    });
    setPending(false);
    setMsg(result.message ?? "");
  }

  return (
    <form onSubmit={handleSettle} className="flex items-end gap-2">
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-ink-muted">{f.label}</label>
          {f.widget === "boolean" ? (
            <select
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink"
            >
              <option value="">—</option>
              <option value="yes">{f.trueLabel}</option>
              <option value="no">{f.falseLabel}</option>
            </select>
          ) : f.widget === "choice" ? (
            <select
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink"
            >
              <option value="">—</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              min={f.min}
              max={f.max}
              step={f.step}
              className="w-24 rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink"
            />
          )}
        </div>
      ))}
      <Button type="submit" size="sm" disabled={pending || !value}>
        {pending ? "…" : "Regler"}
      </Button>
      {msg && <span className="text-[12px] text-ink-muted">{msg}</span>}
    </form>
  );
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  open: "Ouverte",
  closed: "Fermee",
  settled: "Reglee",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-sage-soft text-sage",
  open: "bg-winner-soft text-winner",
  closed: "bg-clay-soft text-clay",
  settled: "bg-perfect-soft text-perfect",
};

interface TeamOption {
  value: string;
  label: string;
}

interface RoundOption {
  id: string;
  name: string;
  number: number;
}

export function QuestionCard({
  question,
  teams = [],
  rounds = [],
  answerCount = 0,
  editable = false,
}: {
  question: BonusQuestion;
  teams?: TeamOption[];
  rounds?: RoundOption[];
  answerCount?: number;
  editable?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const kd = getKind(question.kind);
  const isPodium = question.kind === "podium";

  async function handleAction(action: "open" | "close") {
    setPending(true);
    setMsg("");
    const result =
      action === "open"
        ? await openBonusQuestion(question.id)
        : await closeBonusQuestion(question.id);
    setPending(false);
    setMsg(result.message ?? "");
  }

  async function handleDelete() {
    setPending(true);
    setMsg("");
    const result = await deleteBonusQuestion({ questionId: question.id });
    setPending(false);
    setConfirmingDelete(false);
    setMsg(result.message ?? "");
  }

  if (editing) {
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
        <p className="text-[13px] font-semibold text-ink-muted">Modifier la question</p>
        <EditQuestionForm
          question={question}
          teams={teams}
          rounds={rounds}
          answerCount={answerCount}
          onDone={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold text-ink">{question.prompt}</p>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[question.status] ?? ""}`}>
              {STATUS_LABELS[question.status] ?? question.status}
            </span>
            {kd && (
              <span className="text-[11px] text-ink-faint">{kd.label}</span>
            )}
            {question.roundName && (
              <span className="text-[11px] text-ink-faint">{question.roundName}</span>
            )}
            {question.closesAt && question.status === "open" && (
              <span className="text-[11px] text-ink-faint">
                Fermeture : {new Date(question.closesAt).toLocaleString("fr-FR", {
                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </span>
            )}
            {!question.closesAt && question.status === "draft" && (() => {
              const cfg = question.config as Record<string, unknown> | null;
              const dm = typeof cfg?.deadlineMinutes === "number" ? cfg.deadlineMinutes : null;
              if (!dm) return null;
              const d = Math.floor(dm / (24 * 60));
              const h = Math.floor((dm % (24 * 60)) / 60);
              return (
                <span className="text-[11px] text-ink-faint">
                  Delai : {d > 0 ? `${d}j` : ""}{h > 0 ? ` ${h}h` : ""} apres ouverture
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {question.status === "draft" && (
          <Button
            size="sm"
            onClick={() => handleAction("open")}
            disabled={pending}
          >
            {pending ? "…" : "Ouvrir"}
          </Button>
        )}
        {question.status === "open" && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleAction("close")}
              disabled={pending}
            >
              {pending ? "…" : "Fermer"}
            </Button>
          </>
        )}
        {editable && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={pending}>
            Modifier
          </Button>
        )}
        {editable && !confirmingDelete && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={pending}
            className="text-[12.5px] font-semibold text-wrong hover:underline"
          >
            Supprimer
          </button>
        )}
        {editable && confirmingDelete && (
          <span className="flex items-center gap-2 text-[12.5px] text-ink-muted">
            Supprimer définitivement ?
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="font-semibold text-wrong hover:underline"
            >
              {pending ? "…" : "Confirmer"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="hover:underline"
            >
              Annuler
            </button>
          </span>
        )}
      </div>

      {(question.status === "open" || question.status === "closed") && (
        isPodium
          ? <PodiumSettleForm question={question} />
          : <SimpleSettleForm question={question} />
      )}

      {msg && <p className="mt-2 text-[12px] font-semibold text-ink-muted">{msg}</p>}
    </div>
  );
}
