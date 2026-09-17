/**
 * L'onglet Super-pouvoirs : qui a utilisé quoi, sur quel match, et avec quel
 * résultat — rangé par journée, filtrable par joueur.
 *
 * Composant serveur : rien ici n'a besoin d'état côté navigateur, le filtre
 * passe par l'adresse.
 */

import Link from "next/link";
import { Card, Label } from "@/components/ui";
import { cn } from "@/lib/cn";
import { PlayerAvatar } from "../../_components/player-avatar";
import type { ClubAvatar } from "@/lib/auth/avatars";
import type { PowerHistory } from "@/lib/powers/history";

const VERDICT: Record<string, { label: string; tone: string }> = {
  gagne: { label: "Gagné", tone: "bg-winner-soft text-winner" },
  perdu: { label: "Perdu", tone: "bg-wrong-soft text-wrong" },
  neutre: { label: "Sans effet", tone: "bg-surface-sunk text-ink-faint" },
  attente: { label: "En attente", tone: "bg-clay-soft text-clay" },
};

export function PowerHistoryView({
  history,
  selectedPlayer,
  hrefFor,
  clubs,
}: {
  history: PowerHistory;
  selectedPlayer: string | null;
  /** Construit l'adresse du filtre, en conservant la ligue courante. */
  hrefFor: (playerId: string | null) => string;
  clubs: readonly ClubAvatar[];
}) {
  const total = history.rounds.reduce((sum, r) => sum + r.entries.length, 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Filtre par joueur — la liste reste complète même quand on filtre. */}
      {history.players.length > 0 && (
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4">
          <Link
            href={hrefFor(null)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition",
              selectedPlayer === null
                ? "bg-clay text-surface"
                : "border border-line bg-surface text-ink-muted hover:bg-surface-sunk",
            )}
          >
            Tous
          </Link>
          {history.players.map((p) => (
            <Link
              key={p.id}
              href={hrefFor(p.id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition",
                selectedPlayer === p.id
                  ? "bg-clay text-surface"
                  : "border border-line bg-surface text-ink-muted hover:bg-surface-sunk",
              )}
            >
              {p.name}
              <span className="ml-1.5 opacity-60">{p.count}</span>
            </Link>
          ))}
        </div>
      )}

      {total === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <span className="text-3xl" aria-hidden>⚡</span>
          <p className="font-display text-[17px] text-ink">Aucun pouvoir utilisé</p>
          <p className="max-w-[36ch] text-[14px] text-ink-muted">
            {selectedPlayer
              ? "Ce joueur n'a encore rien activé."
              : "Dès qu'un joueur activera un pouvoir, il apparaîtra ici, journée par journée."}
          </p>
        </Card>
      ) : (
        history.rounds.map((round) => (
          <section key={round.roundId} className="flex flex-col gap-2">
            {/* Le séparateur de journée : le repère demandé, J1, J2, J3… */}
            <div className="flex items-center gap-2.5">
              <span className="rounded-full bg-clay px-2.5 py-1 font-mono text-[11px] font-bold text-surface">
                {round.roundName}
              </span>
              <span className="h-px flex-1 bg-line" />
              <span className="font-mono text-[11px] text-ink-faint">
                {round.entries.length} pouvoir{round.entries.length > 1 ? "s" : ""}
              </span>
            </div>

            <ul className="flex flex-col gap-2">
              {round.entries.map((e) => {
                const badge = VERDICT[e.verdict] ?? VERDICT.neutre;
                return (
                  <li key={e.id}>
                    <Card className="flex items-start gap-3 p-3.5">
                      <PlayerAvatar
                        player={{
                          userId: e.playerId,
                          firstName: e.playerFirstName,
                          displayName: e.playerName,
                          avatarKind: e.avatarKind,
                          avatarValue: e.avatarValue,
                        }}
                        clubs={clubs}
                        size={36}
                      />

                      <div className="min-w-0 flex-1">
                        <p className="text-[14.5px] font-bold leading-tight text-ink">
                          <span className="mr-1" aria-hidden>{e.powerEmoji}</span>
                          {e.playerName} · {e.powerName}
                        </p>

                        <p className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">
                          {[e.matchLabel, e.targetName && `contre ${e.targetName}`]
                            .filter(Boolean)
                            .join(" · ") || "sur la journée entière"}
                        </p>

                        <p className="mt-1 text-[12.5px] leading-snug text-ink">{e.detail}</p>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]",
                            badge.tone,
                          )}
                        >
                          {badge.label}
                        </span>
                        {e.delta !== null && e.delta !== 0 && (
                          <span
                            className={cn(
                              "tabular font-mono text-[13px] font-bold",
                              e.delta > 0 ? "text-winner" : "text-wrong",
                            )}
                          >
                            {e.delta > 0 ? "+" : "−"}
                            {Math.abs(e.delta)}
                          </span>
                        )}
                        {e.usageLabel && (
                          <span className="font-mono text-[10px] text-ink-faint">
                            {e.usageLabel}
                          </span>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {total > 0 && (
        <Label>
          {total} pouvoir{total > 1 ? "s" : ""} au total
          {selectedPlayer ? " pour ce joueur" : ""}
        </Label>
      )}
    </div>
  );
}
