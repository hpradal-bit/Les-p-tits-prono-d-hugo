"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { allKinds } from "@/lib/bonus/registry";
import { createBonusQuestion } from "@/lib/bonus/actions";

export function CreateForm() {
  const kinds = allKinds();
  const [kind, setKind] = useState(kinds[0]?.kind ?? "");
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const selected = kinds.find((k) => k.kind === kind);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setPending(true);
    setMessage(null);
    const result = await createBonusQuestion({
      kind,
      prompt: prompt.trim(),
    });
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
          placeholder="Ex : Toulouse va-t-il gagner samedi ?"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint"
        />
      </div>

      {message && (
        <p className={`text-[13px] font-semibold ${message.ok ? "text-winner" : "text-wrong"}`}>
          {message.text}
        </p>
      )}

      <Button type="submit" disabled={pending || !prompt.trim()} size="sm">
        {pending ? "Création…" : "Créer le brouillon"}
      </Button>
    </form>
  );
}
