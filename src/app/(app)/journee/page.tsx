import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Card } from "@/components/ui";
import { loadJourneyBoard } from "@/lib/predictions/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentSeasonId } from "@/lib/admin/queries";
import { listOpenQuestionsWithAnswer } from "@/lib/bonus/queries";
import { PlayerAvatar } from "../_components/player-avatar";
import { getViewer } from "@/lib/auth/session";
import { MatchCard } from "./_components/match-card";
import { BonusBanner } from "./_components/bonus-banner";

export const metadata: Metadata = { title: "Ce week-end" };
export const dynamic = "force-dynamic";

const params = z.object({ j: z.coerce.number().int().min(1).max(30).optional() });

export default async function JourneePage({
  searchParams,
}: {
  searchParams: Promise<{ j?: string }>;
}) {
  const { j } = params.catch({}).parse(await searchParams);
  const [board, viewer] = await Promise.all([
    loadJourneyBoard({ roundNumber: j }),
    getViewer(),
  ]);
  if (!board || !viewer) redirect("/connexion");

  const admin = createAdminClient();
  const seasonId = await currentSeasonId(admin);
  const allBonusItems = await listOpenQuestionsWithAnswer(admin, seasonId, viewer.id);
  const currentRoundId = board.round.id;
  const bonusItems = allBonusItems.filter(
    (b) => !b.question.roundId || b.question.roundId === currentRoundId,
  );

  const lockLabel = board.nextLockAt
    ? new Date(board.nextLockAt).toLocaleString("fr-FR", {
        weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: board.timeZone,
      }).replace(".", "")
    : null;

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            {board.round.name} · Top 14
          </span>
          <h1 className="font-display text-[32px] leading-none text-ink">Ce week-end</h1>
          <Link href="/regles" className="mt-0.5 w-fit text-[12.5px] font-semibold text-clay underline">
            Comment on joue ?
          </Link>
        </div>
        <PlayerAvatar
          player={{
            userId: viewer.id,
            firstName: viewer.firstName,
            displayName: viewer.displayName,
            avatarKind: viewer.avatarKind,
            avatarValue: viewer.avatarValue,
          }}
          size={42}
        />
      </header>

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-clay-soft px-3 py-1.5 text-[12px] font-semibold text-clay">
          {board.fixtures.length} match{board.fixtures.length > 1 ? "s" : ""}
          {board.hasProvisionalKickoffs && " · horaires provisoires"}
        </span>
        {lockLabel && (
          <span className="rounded-full bg-sage-soft px-3 py-1.5 text-[12px] font-semibold text-sage">
            Verrou {lockLabel}
          </span>
        )}
      </div>

      <BonusBanner items={bonusItems} />

      {board.fixtures.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-ink-muted">Aucun match sur cette journée.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {board.fixtures.map((item) => (
            <li key={item.fixture.id}>
              <MatchCard item={item} ruleset={board.ruleset} timeZone={board.timeZone} />
            </li>
          ))}
        </ul>
      )}

      {board.remainingToPlay > 0 && (
        <Link
          href={`/journee/${board.fixtures.find((f) => !f.isLocked && !f.draft)?.fixture.id ?? board.fixtures[0].fixture.id}`}
          className="sticky bottom-24 mt-1 rounded-full bg-clay px-5 py-4 text-center text-[16px] font-bold text-surface shadow-[var(--shadow-lift)]"
        >
          Faire mes pronos · {board.remainingToPlay} restant{board.remainingToPlay > 1 ? "s" : ""}
        </Link>
      )}

      {board.participation.length > 1 && (
        <p className="px-1 text-center text-[12.5px] text-ink-faint">
          {board.participation
            .filter((p) => p.userId !== viewer.id && p.missing > 0)
            .map((p) => `${p.firstName} : ${p.missing} à jouer`)
            .join(" · ") || "Tout le monde a joué."}
        </p>
      )}
    </div>
  );
}
