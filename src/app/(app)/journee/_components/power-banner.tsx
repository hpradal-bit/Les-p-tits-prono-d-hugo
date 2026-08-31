"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui";
import { declarePower } from "@/lib/powers/actions";

interface PowerOption {
  id: string;
  code: string;
  name: string;
  emoji: string;
  needsTarget: boolean;
  needsFixture: boolean;
  /** Lu depuis `powers.config.target_rule` — "better_ranked_only" restreint
   *  les cibles proposées, toute autre valeur (ou absence) les laisse toutes
   *  ouvertes. Jamais un pouvoir particulier codé en dur ici. */
  targetRule: string | null;
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

interface SpyReveal {
  hasAnswered: boolean;
  outcomeLabel: string | null;
  exactScoreLabel: string | null;
  marginLabel: string | null;
}

interface ActiveUsage {
  id: string;
  powerCode: string;
  powerEmoji: string;
  powerName: string;
  targetName: string | null;
  fixtureName: string | null;
  cost: number;
  spyReveal?: SpyReveal | null;
}

/**
 * Le détail d'un pouvoir — nom, description, coût, activation — dans une
 * fenêtre compacte plutôt qu'une carte dépliée qui pousse tout le reste de
 * l'écran. Même logique d'activation qu'avant (déclarePower), seule la
 * présentation change.
 */
function PowerModal({
  power,
  tokensAvailable,
  fixtures,
  eligibleTargets,
  roundId,
  onClose,
}: {
  power: PowerOption;
  tokensAvailable: number;
  fixtures: FixtureOption[];
  eligibleTargets: PlayerOption[];
  roundId: string;
  onClose: () => void;
}) {
  const [targetId, setTargetId] = useState("");
  const [fixtureId, setFixtureId] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState("");

  const affordable = tokensAvailable >= power.cost;
  const missing = power.needsTarget && eligibleTargets.length === 0;

  async function handleDeclare(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMsg("");
    const result = await declarePower({
      powerCode: power.code,
      roundId,
      targetId: targetId || null,
      fixtureId: fixtureId || null,
    });
    setPending(false);
    setMsg(result.message);
    if (result.ok) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-sm flex-col gap-3 rounded-[28px] bg-surface p-5 shadow-[var(--shadow-lift)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface-sunk text-2xl">
            {power.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[19px] uppercase leading-tight text-ink">
              {power.name}
            </p>
            {power.description && (
              <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{power.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 text-[13px] text-ink-faint"
          >
            ✕
          </button>
        </div>

        {power.effect && (
          <p className="text-[12.5px] leading-snug text-ink">
            <strong className="font-semibold">Effet — </strong>
            {power.effect}
          </p>
        )}
        {power.rules && (
          <p className="text-[11.5px] leading-snug text-ink-faint">
            <strong className="font-semibold">Règles — </strong>
            {power.rules}
          </p>
        )}

        <form onSubmit={handleDeclare} className="flex flex-col gap-2.5">
          {power.needsFixture && (
            <select
              value={fixtureId}
              onChange={(e) => setFixtureId(e.target.value)}
              aria-label="Match concerné"
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
              aria-label="Adversaire visé"
              className="rounded-xl border border-line bg-surface-sunk px-3 py-2 text-[13px] text-ink"
            >
              <option value="">Choisir un adversaire…</option>
              {eligibleTargets.map((t) => (
                <option key={t.userId} value={t.userId}>{t.displayName} (#{t.position})</option>
              ))}
            </select>
          )}

          {missing && (
            <p className="text-[12px] text-ink-faint">Aucun adversaire éligible pour ce pouvoir.</p>
          )}

          <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-sunk px-3.5 py-2.5">
            <span className="font-mono text-[13px] font-bold text-ink">
              {power.cost} crédit{power.cost > 1 ? "s" : ""}
            </span>
            <Button
              type="submit"
              size="sm"
              disabled={
                pending || !affordable || (power.needsFixture && !fixtureId) || (power.needsTarget && !targetId)
              }
            >
              {pending
                ? "…"
                : affordable
                  ? "Utiliser"
                  : `${power.cost - tokensAvailable} crédit${power.cost - tokensAvailable > 1 ? "s" : ""} nécessaire${power.cost - tokensAvailable > 1 ? "s" : ""}`}
            </Button>
          </div>
        </form>

        {msg && <p className="text-[12px] font-semibold text-wrong">{msg}</p>}
      </div>
    </div>
  );
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
  const [openCode, setOpenCode] = useState<string | null>(null);

  // Les pouvoirs restent visibles même sans crédit : c'est une vitrine autant
  // qu'un outil. Seule l'activation est bloquée.
  if (powers.length === 0) return null;

  if (activeUsage) {
    return (
      <div className="flex flex-col gap-1.5 rounded-2xl border border-clay/30 bg-clay-soft/50 px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-[13px] font-bold text-ink">
            <span className="text-lg">{activeUsage.powerEmoji}</span>
            <span className="truncate">{activeUsage.powerName}</span>
            <span className="shrink-0 rounded-full bg-clay px-2 py-0.5 text-[10px] font-bold text-surface">
              ACTIF
            </span>
          </span>
          {/* Un pouvoir acheté est définitif : pas de bouton "Annuler", pour
              qu'aucun joueur ne puisse regarder puis se retirer selon ce qu'il
              a vu (l'Espion, en particulier). */}
        </div>
        {(activeUsage.targetName || activeUsage.fixtureName) && (
          <p className="text-[11.5px] text-ink-muted">
            {[activeUsage.targetName && `vs ${activeUsage.targetName}`, activeUsage.fixtureName]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}

        {activeUsage.powerCode === "spy" && activeUsage.spyReveal && (
          <div className="rounded-xl bg-surface/70 px-3 py-2 text-[12.5px] leading-snug text-ink">
            {!activeUsage.spyReveal.hasAnswered ? (
              <p className="text-ink-faint">
                {activeUsage.targetName ?? "Ta cible"} n&apos;a pas encore pronostiqué ce match.
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                <p className="font-semibold">
                  {activeUsage.targetName} → {activeUsage.spyReveal.outcomeLabel}
                </p>
                {activeUsage.spyReveal.exactScoreLabel && (
                  <p className="text-ink-muted">
                    Score exact → {activeUsage.spyReveal.exactScoreLabel}
                  </p>
                )}
                {!activeUsage.spyReveal.exactScoreLabel && activeUsage.spyReveal.marginLabel && (
                  <p className="text-ink-muted">
                    Écart pronostiqué → {activeUsage.spyReveal.marginLabel}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const openPower = powers.find((p) => p.code === openCode) ?? null;
  const viewerPosition = players.find((x) => x.userId === viewerId)?.position ?? Infinity;
  const eligibleTargets = (power: PowerOption | null) =>
    power?.targetRule === "better_ranked_only"
      ? players.filter((p) => p.userId !== viewerId && p.position < viewerPosition)
      : players.filter((p) => p.userId !== viewerId);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[15px]">⚡</span>
          <h2 className="text-[12.5px] font-bold text-ink">Super-pouvoirs</h2>
        </div>
        <span className="rounded-full bg-clay-soft px-2.5 py-1 text-[11px] font-bold text-clay">
          {tokensAvailable} crédit{tokensAvailable > 1 ? "s" : ""}
        </span>
      </div>

      {/* Une pastille par pouvoir : le détail s'ouvre dans une fenêtre au clic
          plutôt que de pousser le reste de l'écran. */}
      <div className="scrollbar-none -mx-1 flex gap-3 overflow-x-auto px-1 pb-0.5">
        {powers.map((p) => {
          const affordable = tokensAvailable >= p.cost;
          return (
            <button
              key={p.code}
              type="button"
              onClick={() => setOpenCode(p.code)}
              className="flex w-[64px] shrink-0 flex-col items-center gap-1"
            >
              <span
                className={cn(
                  "relative flex size-12 items-center justify-center rounded-full text-[21px]",
                  affordable ? "bg-clay-soft" : "bg-surface-sunk opacity-55",
                )}
              >
                {p.emoji}
                <span className="absolute -bottom-1 -right-1 rounded-full bg-surface px-1 font-mono text-[9px] font-bold text-ink-faint shadow-sm">
                  {p.cost}
                </span>
              </span>
              <span className="w-full truncate text-center text-[10.5px] font-semibold text-ink">
                {p.name}
              </span>
            </button>
          );
        })}
      </div>

      {openPower && (
        <PowerModal
          power={openPower}
          tokensAvailable={tokensAvailable}
          fixtures={fixtures}
          eligibleTargets={eligibleTargets(openPower)}
          roundId={roundId}
          onClose={() => setOpenCode(null)}
        />
      )}
    </section>
  );
}
