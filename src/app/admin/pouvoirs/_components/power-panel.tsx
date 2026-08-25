"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { togglePower, grantTokens } from "@/lib/powers/actions";

interface PowerRow {
  id: string;
  code: string;
  name: string;
  emoji: string;
  isActive: boolean;
}

export function PowerPanel({ powers }: { powers: PowerRow[] }) {
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function handleToggle(powerId: string, active: boolean) {
    setPending(powerId);
    setMsg("");
    const result = await togglePower(powerId, active);
    setPending(null);
    setMsg(result.message ?? "");
  }

  return (
    <div className="flex flex-col gap-3">
      {powers.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-lg border border-line bg-surface p-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{p.emoji}</span>
            <span className="text-[14px] font-semibold text-ink">{p.name}</span>
            <span className="text-[11px] text-ink-faint">{p.code}</span>
          </div>
          <Button
            size="sm"
            variant={p.isActive ? "danger" : "primary"}
            onClick={() => handleToggle(p.id, !p.isActive)}
            disabled={pending === p.id}
          >
            {pending === p.id ? "…" : p.isActive ? "Desactiver" : "Activer"}
          </Button>
        </div>
      ))}
      {msg && <p className="text-[12px] font-semibold text-ink-muted">{msg}</p>}
    </div>
  );
}

export function TokenGrantForm() {
  const [period, setPeriod] = useState<string>("full_season");
  const [count, setCount] = useState(2);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMsg("");
    const result = await grantTokens({ period, count });
    setPending(false);
    setMsg(result.message ?? "");
  }

  return (
    <form onSubmit={handleGrant} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-ink-muted">Periode</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink"
          >
            <option value="full_season">Saison entiere</option>
            <option value="first_half">1ere moitie</option>
            <option value="second_half">2e moitie</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-ink-muted">Nombre par joueur</label>
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value, 10) || 1)}
            min={1}
            max={10}
            className="w-20 rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink"
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "…" : "Distribuer"}
        </Button>
      </div>
      {msg && <p className="text-[12px] font-semibold text-ink-muted">{msg}</p>}
    </form>
  );
}
