"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { IDLE } from "@/lib/auth/action-state";
import { setLeagueMemberRole, removeLeagueMember } from "@/lib/leagues/actions.ts";
import type { LeagueMemberRow } from "@/lib/leagues/types.ts";

export function MemberRow({
  leagueId,
  member,
  isMe,
}: {
  leagueId: string;
  member: LeagueMemberRow;
  isMe: boolean;
}) {
  const [, roleAction, rolePending] = useActionState(setLeagueMemberRole, IDLE);
  const [, removeAction, removePending] = useActionState(removeLeagueMember, IDLE);
  const isAdmin = member.role === "admin";

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-[14px] font-semibold text-ink">
          {member.displayName}
          {isMe && <span className="text-ink-faint"> (toi)</span>}
        </span>
        <span className="text-[12px] text-ink-faint">{isAdmin ? "Administrateur" : "Joueur"}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <form action={roleAction}>
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="userId" value={member.userId} />
          <input type="hidden" name="role" value={isAdmin ? "player" : "admin"} />
          <Button type="submit" size="sm" variant="ghost" disabled={rolePending}>
            {isAdmin ? "Retirer l'admin" : "Passer admin"}
          </Button>
        </form>
        {!isMe && (
          <form action={removeAction}>
            <input type="hidden" name="leagueId" value={leagueId} />
            <input type="hidden" name="userId" value={member.userId} />
            <Button type="submit" size="sm" variant="danger" disabled={removePending}>
              Retirer
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
