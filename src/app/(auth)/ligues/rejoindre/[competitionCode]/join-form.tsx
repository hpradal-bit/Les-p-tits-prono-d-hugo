"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { IDLE } from "@/lib/auth/action-state";
import { joinLeagueByKey } from "@/lib/leagues/actions.ts";

export function JoinForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(joinLeagueByKey, IDLE);

  if (state.status === "success") {
    return (
      <Card className="flex flex-col gap-3 p-6 text-center">
        <span className="text-4xl" aria-hidden>
          🎉
        </span>
        <p className="text-[15px] font-semibold text-ink">{state.message}</p>
        <Button onClick={() => router.push("/accueil")}>Accéder à mes ligues</Button>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <form action={formAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[14px] font-semibold text-ink">Entre la clé de ta ligue</span>
          <input
            type="text"
            name="joinKey"
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="A7K92F"
            className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-[16px] uppercase tracking-[0.12em] text-ink"
          />
        </label>
        {state.status === "error" && state.message && (
          <p role="alert" className="text-[13px] font-medium text-wrong">
            {state.message}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Vérification…" : "Rejoindre la ligue"}
        </Button>
      </form>
    </Card>
  );
}
