"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { setPlayerActive, setPlayerRole, adjustPoints } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";
import type { AdminPlayer, AdminRound } from "@/lib/admin/queries";
import { Feedback, numberInput, reasonInput, textInput } from "../../bareme/_components/shared";

/**
 * Un joueur : son total, son rôle, sa présence au classement, et de quoi lui
 * ajouter ou retirer des points à la main.
 */
export function PlayerCard({
  player,
  rounds,
  leagueId,
}: {
  player: AdminPlayer;
  rounds: AdminRound[];
  leagueId: string;
}) {
  const [activeState, activeAction, activePending] = useActionState(setPlayerActive, ADMIN_IDLE);
  const [roleState, roleAction, rolePending] = useActionState(setPlayerRole, ADMIN_IDLE);
  const [adjustState, adjustAction, adjustPending] = useActionState(adjustPoints, ADMIN_IDLE);
  const [open, setOpen] = useState(false);

  const isAdmin = player.role === "admin";
  const feedback =
    adjustState.status !== "idle"
      ? adjustState
      : roleState.status !== "idle"
        ? roleState
        : activeState;

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border p-4 ${
        player.isActive ? "border-line bg-surface" : "border-line bg-surface-sunk opacity-70"
      }`}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-2xl">
          {player.avatarKind === "emoji" ? player.avatarValue : "🏉"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15.5px] font-semibold text-ink">
              {player.displayName}
            </span>
            {isAdmin && (
              <span className="rounded-full bg-clay-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-clay">
                Admin
              </span>
            )}
            {!player.isActive && (
              <span className="rounded-full bg-surface-sunk px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                Inactif
              </span>
            )}
          </span>
          <span className="block truncate text-[12.5px] text-ink-muted">
            {player.firstName}
            {player.adjustmentTotal !== 0 &&
              ` · ${player.adjustmentTotal > 0 ? "+" : ""}${player.adjustmentTotal} pt d'ajustement`}
          </span>
        </span>
        <span className="text-right">
          <span className="block font-mono text-[19px] tabular font-semibold text-ink">
            {player.seasonPoints}
          </span>
          <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
            pts
          </span>
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "Fermer" : "Ajuster les points"}
        </Button>

        <form action={activeAction} className="contents">
          <input type="hidden" name="userId" value={player.id} />
          <input type="hidden" name="isActive" value={player.isActive ? "false" : "true"} />
          <input
            type="hidden"
            name="reason"
            value={player.isActive ? "Joueur désactivé depuis l'espace admin" : "Joueur réactivé depuis l'espace admin"}
          />
          <Button type="submit" size="sm" variant="ghost" disabled={activePending}>
            {player.isActive ? "Désactiver" : "Réactiver"}
          </Button>
        </form>

        <form action={roleAction} className="contents">
          <input type="hidden" name="userId" value={player.id} />
          <input type="hidden" name="role" value={isAdmin ? "player" : "admin"} />
          <input
            type="hidden"
            name="reason"
            value={isAdmin ? "Retrait des droits d'administration" : "Attribution des droits d'administration"}
          />
          <Button type="submit" size="sm" variant="ghost" disabled={rolePending}>
            {isAdmin ? "Retirer l'admin" : "Passer admin"}
          </Button>
        </form>
      </div>

      {open && (
        <form action={adjustAction} className="flex flex-col gap-3 rounded-xl border border-line bg-surface-sunk p-3">
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="userId" value={player.id} />

          <div className="flex flex-wrap items-center gap-2">
            <input
              className={numberInput}
              type="number"
              name="delta"
              min={-999}
              max={999}
              required
              placeholder="±0"
              aria-label="Points à ajouter ou retirer"
            />
            <span className="text-[13px] text-ink-muted">points, sur</span>
            <select name="roundId" defaultValue="" className={`${textInput} w-auto`}>
              <option value="">toute la saison</option>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <input
            name="reason"
            required
            minLength={3}
            placeholder="Raison — les joueurs la liront (ex. : pari perdu sur le derby)"
            className={reasonInput}
          />

          <div>
            <Button type="submit" size="sm" disabled={adjustPending}>
              {adjustPending ? "Enregistrement…" : "Appliquer l'ajustement"}
            </Button>
          </div>
        </form>
      )}

      <Feedback state={feedback} />
    </div>
  );
}
