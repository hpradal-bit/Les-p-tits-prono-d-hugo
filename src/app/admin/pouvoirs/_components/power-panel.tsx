"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { togglePower, setPowerMaxUses } from "@/lib/powers/actions";

interface PowerRow {
  id: string;
  code: string;
  name: string;
  emoji: string;
  isActive: boolean;
  maxUses: number;
}

export function PowerPanel({ powers }: { powers: PowerRow[] }) {
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [quotas, setQuotas] = useState<Record<string, number>>(
    Object.fromEntries(powers.map((p) => [p.id, p.maxUses])),
  );

  async function handleToggle(powerId: string, active: boolean) {
    setPending(powerId);
    setMsg("");
    const result = await togglePower(powerId, active);
    setPending(null);
    setMsg(result.message ?? "");
  }

  async function handleMaxUses(powerId: string) {
    setPending(powerId);
    setMsg("");
    const result = await setPowerMaxUses({ powerId, maxUses: quotas[powerId] ?? 0 });
    setPending(null);
    setMsg(result.message ?? "");
  }

  return (
    <div className="flex flex-col gap-3">
      {powers.map((p) => (
        <div
          key={p.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{p.emoji}</span>
            <span className="text-[14px] font-semibold text-ink">{p.name}</span>
            <span className="text-[11px] text-ink-faint">{p.code}</span>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor={`quota-${p.id}`}
              className="text-[11px] font-semibold text-ink-muted"
            >
              Max / joueur
            </label>
            <input
              id={`quota-${p.id}`}
              type="number"
              min={0}
              max={50}
              value={quotas[p.id] ?? 0}
              onChange={(e) =>
                setQuotas((c) => ({ ...c, [p.id]: parseInt(e.target.value, 10) || 0 }))
              }
              className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleMaxUses(p.id)}
              disabled={pending === p.id || quotas[p.id] === p.maxUses}
            >
              {pending === p.id ? "…" : "Enregistrer"}
            </Button>
            <Button
              size="sm"
              variant={p.isActive ? "danger" : "primary"}
              onClick={() => handleToggle(p.id, !p.isActive)}
              disabled={pending === p.id}
            >
              {pending === p.id ? "…" : p.isActive ? "Désactiver" : "Activer"}
            </Button>
          </div>
        </div>
      ))}
      {msg && <p className="text-[12px] font-semibold text-ink-muted">{msg}</p>}
    </div>
  );
}
