"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { allKinds } from "@/lib/bonus/registry";
import { createBonusQuestion } from "@/lib/bonus/actions";

interface TeamOption {
  value: string;
  label: string;
}

export function CreateForm({ teams }: { teams: TeamOption[] }) {
  const kinds = allKinds();
  const [kind, setKind] = useState(kinds[0]?.kind ?? "");
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(3);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const selected = kinds.find((k) => k.kind === kind);
  const isPodium = kind === "podium";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setPending(true);
    setMessage(null);

    const payload: Record<string, unknown> = {
      kind,
      prompt: prompt.trim(),
    };

    if (isPodium) {
      payload.config = {
        options: teams,
        count,
      };
      payload.scoring = { exact_position: 5, in_podium: 2 };
    }

    const result = await createBonusQuestion(payload);
    setPending(false);
    setMessage({
      ok: result.status === "success",
      text: result.message ?? "Fait.",
    });
    if (result.status === "success") setPrompt("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-semibold text-ink">Type</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink"
        >
          {kinds.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        {selected && (
          <p className="text-[12px] text-ink-muted">{selected.help}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-semibold text-ink">Question</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={
            isPodium
              ? "Ex : Qui seront les 3 premiers du Top 14 ?"
              : "Ex : Toulouse va-t-il gagner samedi ?"
          }
          className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint"
        />
      </div>

      {isPodium && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-semibold text-ink">
            Nombre de places a predire
          </label>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-20 rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <p className="text-[12px] text-ink-muted">
            {teams.length} equipe{teams.length > 1 ? "s" : ""} disponible{teams.length > 1 ? "s" : ""} dans la saison.
            Bareme : 5 pts position exacte, 2 pts si presente.
          </p>
        </div>
      )}

      {message && (
        <p className={`text-[13px] font-semibold ${message.ok ? "text-winner" : "text-wrong"}`}>
          {message.text}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending || !prompt.trim() || (isPodium && teams.length < count)}
        size="sm"
      >
        {pending ? "Creation…" : "Creer le brouillon"}
      </Button>
    </form>
  );
}
