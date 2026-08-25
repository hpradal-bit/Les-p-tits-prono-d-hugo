"use client";

import { useState } from "react";
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
      <div className="rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{activeUsage.powerEmoji}</span>
            <div>
              <p className="text-[13px] font-semibold text-ink">
                {activeUsage.powerName} active
              </p>
              <p className="text-[11px] text-ink-faint">
                {activeUsage.targetName && `contre ${activeUsage.targetName}`}
                {activeUsage.fixtureName && `sur ${activeUsage.fixtureName}`}
              </p>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={handleCancel} disabled={pending}>
            {pending ? "…" : "Annuler"}
          </Button>
        </div>
        {msg && <p className="mt-2 text-[12px] font-semibold text-ink-muted">{msg}</p>}
      </div>
    );
  }

  const eligibleTargets = players.filter(
    (p) => p.userId !== viewerId && p.position < (players.find((x) => x.userId === viewerId)?.position ?? Infinity),
  );

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">⚡</span>
        <p className="text-[13px] font-semibold text-ink">
          {tokensAvailable} token{tokensAvailable > 1 ? "s" : ""} disponible{tokensAvailable > 1 ? "s" : ""}
        </p>
      </div>

      <form onSubmit={handleDeclare} className="flex flex-col gap-2">
        <select
          value={selectedPower}
          onChange={(e) => { setSelectedPower(e.target.value); setTargetId(""); setFixtureId(""); }}
          className="rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink"
        >
          <option value="">Choisir un pouvoir…</option>
          {powers.map((p) => (
            <option key={p.code} value={p.code}>{p.emoji} {p.name}</option>
          ))}
        </select>

        {power?.needsFixture && (
          <select
            value={fixtureId}
            onChange={(e) => setFixtureId(e.target.value)}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink"
          >
            <option value="">Choisir un match…</option>
            {fixtures.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        )}

        {power?.needsTarget && (
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink"
          >
            <option value="">Choisir un adversaire…</option>
            {eligibleTargets.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.displayName} (#{p.position})
              </option>
            ))}
          </select>
        )}

        {selectedPower && (
          <Button
            type="submit"
            size="sm"
            disabled={
              pending ||
              (power?.needsFixture && !fixtureId) ||
              (power?.needsTarget && !targetId)
            }
          >
            {pending ? "…" : "Activer"}
          </Button>
        )}
      </form>

      {msg && <p className="mt-2 text-[12px] font-semibold text-ink-muted">{msg}</p>}
    </div>
  );
}
