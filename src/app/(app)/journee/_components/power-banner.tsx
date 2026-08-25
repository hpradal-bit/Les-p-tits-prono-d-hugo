"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui";
import { declarePower, cancelPower } from "@/lib/powers/actions";

interface PowerOption {
  id: string;
  code: string;
  name: string;
  emoji: string;
  needsTarget: boolean;
  needsFixture: boolean;
}

interface FixtureOption {
  id: string;
  label: string;
}

interface PlayerOption {
  userId: string;
  displayName: string;
  position: number;
}

interface ActiveUsage {
  id: string;
  powerCode: string;
  powerEmoji: string;
  powerName: string;
  targetName: string | null;
  fixtureName: string | null;
}

const POWER_DESCRIPTIONS: Record<string, string> = {
  joker: "Double tes points sur un match",
  duel: "Défie un joueur mieux classé",
  spy: "Espionne le prono d'un adversaire",
  oracle: "Bonus garanti sur un match",
  sabotage: "Retire des points à un adversaire",
};

export function PowerBanner({
  powers,
  tokensAvailable,
  roundId,
  fixtures,
  players,
  activeUsage,
  viewerId,
}: {
  powers: PowerOption[];
  tokensAvailable: number;
  roundId: string;
  fixtures: FixtureOption[];
  players: PlayerOption[];
  activeUsage: ActiveUsage | null;
  viewerId: string;
}) {
  const [selectedPower, setSelectedPower] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [fixtureId, setFixtureId] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState("");

  if (powers.length === 0) return null;
  if (tokensAvailable === 0 && !activeUsage) return null;

  const power = powers.find((p) => p.code === selectedPower);

  async function handleDeclare(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPower) return;
    setPending(true);
    setMsg("");
    const result = await declarePower({
      powerCode: selectedPower,
      roundId,
      targetId: targetId || null,
      fixtureId: fixtureId || null,
    });
    setPending(false);
    setMsg(result.message);
    if (result.ok) {
      setSelectedPower("");
      setTargetId("");
      setFixtureId("");
    }
  }

  async function handleCancel() {
    if (!activeUsage) return;
    setPending(true);
    setMsg("");
    const result = await cancelPower(activeUsage.id);
    setPending(false);
    setMsg(result.message);
  }

  if (activeUsage) {
    return (
      <div className="rounded-2xl border-2 border-clay/30 bg-clay-soft/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-clay/10 text-xl">
              {activeUsage.powerEmoji}
            </span>
            <div>
              <p className="text-[14px] font-bold text-ink">
                {activeUsage.powerName}
                <span className="ml-1.5 rounded-full bg-clay px-2 py-0.5 text-[10px] font-bold text-surface">
                  ACTIVE
                </span>
              </p>
              <p className="text-[12px] text-ink-muted">
                {[activeUsage.targetName && `vs ${activeUsage.targetName}`, activeUsage.fixtureName].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={handleCancel} disabled={pending}>
            {pending ? "…" : "Annuler"}
          </Button>
        </div>
        {msg && <p className="mt-2 text-[12px] font-semibold text-wrong">{msg}</p>}
      </div>
    );
  }

  const eligibleTargets = power?.code === "duel"
    ? players.filter(
        (p) => p.userId !== viewerId && p.position < (players.find((x) => x.userId === viewerId)?.position ?? Infinity),
      )
    : players.filter((p) => p.userId !== viewerId);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <p className="text-[13px] font-bold text-ink">Super-pouvoirs</p>
        </div>
        <span className="rounded-full bg-clay-soft px-2.5 py-1 text-[11px] font-bold text-clay">
          {tokensAvailable} crédit{tokensAvailable > 1 ? "s" : ""}
        </span>
      </div>

      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
        {powers.map((p) => {
          const isSelected = selectedPower === p.code;
          return (
            <button
              key={p.code}
              type="button"
              onClick={() => {
                setSelectedPower(isSelected ? "" : p.code);
                setTargetId("");
                setFixtureId("");
                setMsg("");
              }}
              className={cn(
                "flex w-[130px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border-2 p-3 transition",
                isSelected
                  ? "border-clay bg-clay-soft/60 shadow-sm"
                  : "border-line bg-surface hover:border-clay/30",
              )}
            >
              <span className="text-2xl">{p.emoji}</span>
              <span className="text-[13px] font-bold text-ink">{p.name}</span>
              <span className="text-center text-[10px] leading-tight text-ink-faint">
                {POWER_DESCRIPTIONS[p.code] ?? "Pouvoir spécial"}
              </span>
            </button>
          );
        })}
      </div>

      {selectedPower && power && (
        <form onSubmit={handleDeclare} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
          <p className="text-[12px] font-semibold text-ink-muted">
            {power.emoji} {power.name} — {POWER_DESCRIPTIONS[power.code] ?? ""}
          </p>

          {power.needsFixture && (
            <select
              value={fixtureId}
              onChange={(e) => setFixtureId(e.target.value)}
              className="rounded-xl border border-line bg-surface-sunk px-3 py-2 text-[13px] text-ink"
            >
              <option value="">Choisir un match…</option>
              {fixtures.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          )}

          {power.needsTarget && (
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="rounded-xl border border-line bg-surface-sunk px-3 py-2 text-[13px] text-ink"
            >
              <option value="">Choisir un adversaire…</option>
              {eligibleTargets.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.displayName} (#{p.position})
                </option>
              ))}
            </select>
          )}

          <Button
            type="submit"
            size="sm"
            disabled={
              pending ||
              (power.needsFixture && !fixtureId) ||
              (power.needsTarget && !targetId)
            }
          >
            {pending ? "Activation…" : `Activer ${power.name}`}
          </Button>
        </form>
      )}

      {msg && <p className="text-[12px] font-semibold text-wrong">{msg}</p>}
    </div>
  );
}
