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
  /** Coût en crédits, lu depuis `powers.config` — jamais en dur ici. */
  cost: number;
  description: string | null;
  effect: string | null;
  rules: string | null;
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
  cost: number;
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

  // Les pouvoirs restent visibles même sans crédit : c'est une vitrine autant
  // qu'un outil. Seule l'activation est bloquée.
  if (powers.length === 0) return null;

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
                  ACTIF
                </span>
              </p>
              <p className="text-[12px] text-ink-muted">
                {[
                  activeUsage.targetName && `vs ${activeUsage.targetName}`,
                  activeUsage.fixtureName,
                  `${activeUsage.cost} cr.`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
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

  const viewerPosition = players.find((x) => x.userId === viewerId)?.position ?? Infinity;
  const eligibleTargets =
    power?.code === "duel"
      ? players.filter((p) => p.userId !== viewerId && p.position < viewerPosition)
      : players.filter((p) => p.userId !== viewerId);

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <h2 className="text-[13px] font-bold text-ink">Super-pouvoirs</h2>
        </div>
        <span className="rounded-full bg-clay-soft px-2.5 py-1 text-[11px] font-bold text-clay">
          Il te reste {tokensAvailable} crédit{tokensAvailable > 1 ? "s" : ""}
        </span>
      </div>

      {/* Une carte par pouvoir : emoji à gauche, texte au centre, coût à droite. */}
      <ul className="flex flex-col gap-2">
        {powers.map((p) => {
          const isSelected = selectedPower === p.code;
          const affordable = tokensAvailable >= p.cost;

          return (
            <li key={p.code}>
              <button
                type="button"
                aria-expanded={isSelected}
                onClick={() => {
                  setSelectedPower(isSelected ? "" : p.code);
                  setTargetId("");
                  setFixtureId("");
                  setMsg("");
                }}
                className={cn(
                  "flex w-full items-stretch gap-3 rounded-[20px] border-2 p-3 text-left transition",
                  isSelected
                    ? "border-clay bg-clay-soft/50"
                    : "border-line bg-surface hover:border-clay/30",
                  !affordable && "opacity-55",
                )}
              >
                <span className="flex size-11 shrink-0 items-center justify-center self-start rounded-2xl bg-surface-sunk text-[22px]">
                  {p.emoji}
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14.5px] font-bold text-ink">{p.name}</span>
                  {p.description && (
                    <span className="text-[12.5px] leading-snug text-ink-muted">
                      {p.description}
                    </span>
                  )}
                  {isSelected && p.effect && (
                    <span className="mt-1 text-[12px] leading-snug text-ink">
                      <strong className="font-semibold">Effet — </strong>
                      {p.effect}
                    </span>
                  )}
                  {isSelected && p.rules && (
                    <span className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">
                      <strong className="font-semibold">Règles — </strong>
                      {p.rules}
                    </span>
                  )}
                  {!affordable && (
                    <span className="mt-1 text-[11px] font-semibold text-wrong">
                      Il te manque {p.cost - tokensAvailable} crédit
                      {p.cost - tokensAvailable > 1 ? "s" : ""}
                    </span>
                  )}
                </span>

                <span
                  className={cn(
                    "flex w-[58px] shrink-0 flex-col items-center justify-center gap-0.5 self-start rounded-2xl px-1 py-2",
                    affordable ? "bg-clay-soft text-clay" : "bg-surface-sunk text-ink-faint",
                  )}
                >
                  <span className="tabular font-mono text-[17px] font-bold leading-none">
                    {p.cost}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.1em]">
                    crédit{p.cost > 1 ? "s" : ""}
                  </span>
                </span>
              </button>

              {isSelected && power && (
                <form
                  onSubmit={handleDeclare}
                  className="mt-1.5 flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-3"
                >
                  {power.needsFixture && (
                    <select
                      value={fixtureId}
                      onChange={(e) => setFixtureId(e.target.value)}
                      aria-label="Match concerné"
                      className="rounded-xl border border-line bg-surface-sunk px-3 py-2 text-[13px] text-ink"
                    >
                      <option value="">Choisir un match…</option>
                      {fixtures.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {power.needsTarget && (
                    <select
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
                      aria-label="Adversaire visé"
                      className="rounded-xl border border-line bg-surface-sunk px-3 py-2 text-[13px] text-ink"
                    >
                      <option value="">Choisir un adversaire…</option>
                      {eligibleTargets.map((t) => (
                        <option key={t.userId} value={t.userId}>
                          {t.displayName} (#{t.position})
                        </option>
                      ))}
                    </select>
                  )}

                  {power.needsTarget && eligibleTargets.length === 0 && (
                    <p className="text-[12px] text-ink-faint">
                      Aucun adversaire éligible pour ce pouvoir.
                    </p>
                  )}

                  <Button
                    type="submit"
                    size="sm"
                    disabled={
                      pending ||
                      !affordable ||
                      (power.needsFixture && !fixtureId) ||
                      (power.needsTarget && !targetId)
                    }
                  >
                    {pending
                      ? "Activation…"
                      : `Activer ${power.name} · ${power.cost} cr.`}
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>

      {msg && <p className="text-[12px] font-semibold text-wrong">{msg}</p>}
    </section>
  );
}
