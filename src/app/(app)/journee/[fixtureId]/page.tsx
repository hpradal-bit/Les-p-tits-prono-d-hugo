import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { loadJourneyBoard } from "@/lib/predictions/queries";
import { PronoForm } from "./prono-form";

export const metadata: Metadata = { title: "Faire son prono" };
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const leagueSchema = z.string().uuid();

/** « Verrou dans 4 h 12 » — le compte à rebours, en clair. */
function lockCountdown(locksAt: string, now: string): string {
  const ms = new Date(locksAt).getTime() - new Date(now).getTime();
  if (ms <= 0) return "Verrouillé";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `Verrou dans ${days} j ${hours % 24} h`;
  }
  return `Verrou dans ${hours} h ${String(minutes).padStart(2, "0")}`;
}

export default async function PronoPage({
  params,
  searchParams,
}: {
  params: Promise<{ fixtureId: string }>;
  searchParams: Promise<{ league?: string }>;
}) {
  const parsed = idSchema.safeParse((await params).fixtureId);
  if (!parsed.success) notFound();
  const leagueParsed = leagueSchema.safeParse((await searchParams).league);
  if (!leagueParsed.success) redirect("/accueil");

  const board = await loadJourneyBoard({ leagueId: leagueParsed.data });
  if (!board) redirect("/connexion");

  const item = board.fixtures.find((f) => f.fixture.id === parsed.data);
  if (!item) notFound();
  // Une fois verrouillé, il n'y a plus rien à saisir : le Match Center prend le relais.
  if (item.isLocked) redirect(`/match/${item.fixture.id}`);

  return (
    <div className="flex min-h-[70dvh] flex-col gap-4">
      <header className="flex items-center gap-3">
        <Link
          href={`/journee?league=${board.leagueId}`}
          aria-label="Retour à la journée"
          className="grid size-[38px] shrink-0 place-items-center rounded-full border border-line-strong text-ink-muted"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
          </svg>
        </Link>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-clay">
            {lockCountdown(item.fixture.locksAt, board.serverNow)}
            {!item.fixture.kickoffConfirmed && " · horaire provisoire"}
          </span>
          <span className="truncate text-[16px] font-bold text-ink">
            {item.fixture.homeTeam.shortName} – {item.fixture.awayTeam.shortName}
          </span>
        </div>
      </header>

      <PronoForm item={item} roundId={board.round.id} ruleset={board.ruleset} leagueId={board.leagueId} />
    </div>
  );
}
