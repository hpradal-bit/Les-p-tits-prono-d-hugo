"use client";

import { useState, useTransition } from "react";
import { Button, Card } from "@/components/ui";
import { createLeague, type CreateLeagueResult } from "@/lib/leagues/actions.ts";

export function CreateLeagueForm({
  competitions,
}: {
  competitions: Array<{ code: string; name: string; sportName: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateLeagueResult | null>(null);
  const [copied, setCopied] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const input = {
      competitionCode: String(form.get("competitionCode") ?? ""),
      name: String(form.get("name") ?? ""),
      logoUrl: String(form.get("logoUrl") ?? ""),
      slogan: String(form.get("slogan") ?? ""),
    };
    startTransition(async () => {
      const result = await createLeague(input);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setCreated(result.league);
    });
  }

  if (created) {
    return (
      <Card className="flex flex-col gap-4 p-6 text-center">
        <span className="text-4xl" aria-hidden>
          🏆
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Ligue créée !
          </p>
          <p className="font-display text-2xl text-ink">{created.name}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-ink-muted">Clé</span>
          <span className="rounded-xl bg-surface-sunk px-4 py-3 font-mono text-2xl tracking-[0.2em] text-ink">
            {created.joinKey}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(created.joinKey);
              setCopied(true);
            } catch {
              // Presse-papiers indisponible : la clé reste affichée à l'écran.
            }
          }}
        >
          {copied ? "Copiée ✓" : "Copier la clé"}
        </Button>
        <p className="text-[12.5px] leading-relaxed text-ink-faint">
          Envoie cette clé à tes amis : « Rejoindre une ligue » leur suffira.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-semibold text-ink">Compétition</span>
          <select
            name="competitionCode"
            required
            className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-[15px] text-ink"
          >
            {competitions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.sportName} · {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-semibold text-ink">Nom de la ligue</span>
          <input
            type="text"
            name="name"
            required
            maxLength={80}
            placeholder="Prono des copains"
            className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-[15px] text-ink"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-semibold text-ink">Logo (facultatif)</span>
          <input
            type="url"
            name="logoUrl"
            placeholder="https://…"
            className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-[15px] text-ink"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-semibold text-ink">Slogan (facultatif)</span>
          <input
            type="text"
            name="slogan"
            maxLength={140}
            placeholder="On ne pronostique pas, on prophétise."
            className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-[15px] text-ink"
          />
        </label>

        {message && (
          <p role="alert" className="text-[13px] font-medium text-wrong">
            {message}
          </p>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Création…" : "Créer la ligue"}
        </Button>
      </form>
    </Card>
  );
}
