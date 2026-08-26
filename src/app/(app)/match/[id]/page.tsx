import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/session";
import { loadMatchCenter, type MatchPrediction } from "@/lib/standings/queries";
import { TeamLogo } from "@/components/ui";
import { RevealRow } from "../_components/reveal-row";

export const metadata: Metadata = { title: "Le match" };
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/** Ce qu'un joueur a joué, en une ligne lisible. */
function label(p: MatchPrediction, home: string, away: string): string {
  const side = p.outcome === "home" ? home : p.outcome === "away" ? away : "Nul";
  if (p.exactHomeScore !== null && p.exactAwayScore !== null) {
    return `${side} · ${p.exactHomeScore}–${p.exactAwayScore}`;
  }
  return p.marginBucketLabel ? `${side} · écart ${p.marginBucketLabel}` : side;
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();

  const viewer = await getViewer();
  if (!viewer) redirect("/connexion");

  const sb = await createClient();
  const data = await loadMatchCenter(sb, parsed.data, viewer.id);
  if (!data) notFound();

  const { fixture, predictions, mine, isLocked, competitionCode } = data;
  const home = fixture.homeTeam.shortName;
  const away = fixture.awayTeam.shortName;

  const onHome = predictions.filter((p) => p.outcome === "home").length;
  const onAway = predictions.filter((p) => p.outcome === "away").length;
  const hasScore = fixture.homeScore !== null && fixture.awayScore !== null;

  // Un joueur seul de son camp mérite d'être signalé : c'est le sel du groupe.
  const loner = (p: MatchPrediction) =>
    (p.outcome === "home" && onHome === 1) || (p.outcome === "away" && onAway === 1);

  return (
    <div className="-mx-4 flex flex-col">
      {/* Le bandeau */}
      <header className="flex flex-col gap-3 bg-sage px-6 pb-4 pt-3 text-surface">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-surface/70">
            {!isLocked
              ? "Pronos encore ouverts"
              : hasScore
                ? fixture.status === "live" ? "En cours" : "Terminé"
                : "Coup d'envoi · les pronos s'ouvrent"}
          </span>
          <h1 className="font-display text-[30px] leading-[1.02]">
            {home}
            <br />
            {away}
          </h1>
        </div>

        {hasScore ? (
          <div className="flex items-center gap-4">
            <TeamLogo team={fixture.homeTeam} size={30} />
            <span className="tabular font-display text-[28px] leading-none">
              {fixture.homeScore} – {fixture.awayScore}
            </span>
            <TeamLogo team={fixture.awayTeam} size={30} />
            {fixture.minute !== null && fixture.status === "live" && (
              <span className="ml-auto rounded-full bg-surface/20 px-2.5 py-1 text-[12px] font-bold">
                {fixture.minute}&apos;
              </span>
            )}
          </div>
        ) : isLocked && predictions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sage-soft/25 px-3 py-1.5 text-[12px] font-semibold">
              {onHome} sur {home}
            </span>
            <span className="rounded-full bg-sage-soft/15 px-3 py-1.5 text-[12px] font-semibold">
              {onAway} sur {away}
            </span>
          </div>
        ) : null}
      </header>

      <div className="flex flex-col gap-2.5 px-4 pt-3">
        {!isLocked ? (
          <div className="flex flex-col gap-2.5 rounded-[28px] bg-surface p-4 shadow-[var(--shadow-card)]">
            <p className="text-[14px] leading-relaxed text-ink">
              Les pronostics des autres restent invisibles jusqu&apos;au verrouillage —
              et ce n&apos;est pas l&apos;écran qui le décide, c&apos;est la base de données
              qui refuse de les envoyer.
            </p>
            {mine && (
              <p className="text-[13px] text-ink-muted">
                Le tien : <strong className="text-ink">{label(mine, home, away)}</strong>
              </p>
            )}
            <Link
              href={`/journee/${fixture.id}?ligue=${competitionCode}`}
              className="mt-1 rounded-full bg-clay py-3 text-center text-[15px] font-bold text-surface"
            >
              {mine ? "Modifier mon prono" : "Faire mon prono"}
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                Ce que les autres ont joué
              </span>
              <span className="text-[11px] text-ink-muted">
                {predictions.length} pronostic{predictions.length > 1 ? "s" : ""}
              </span>
            </div>

            {predictions.length === 0 ? (
              <div className="rounded-[28px] bg-surface p-6 text-center shadow-[var(--shadow-card)]">
                <p className="text-ink-muted">Personne n&apos;a joué ce match.</p>
              </div>
            ) : (
              predictions.map((p) => (
                <RevealRow
                  key={p.player.userId}
                  prediction={p}
                  label={label(p, home, away)}
                  isMine={p.player.userId === viewer.id}
                  isAlone={loner(p)}
                  // Le sien est déjà connu : inutile de le faire retourner.
                  startRevealed={p.player.userId === viewer.id || hasScore}
                />
              ))
            )}

            {predictions.some(loner) && !hasScore && (
              <div className="flex items-start gap-2.5 rounded-[16px] bg-clay-soft p-3.5">
                <span className="text-[15px]" aria-hidden>👀</span>
                <p className="text-[12px] leading-relaxed text-clay">
                  {predictions.filter(loner).map((p) => p.player.firstName).join(" et ")}
                  {predictions.filter(loner).length > 1 ? " sont les seuls" : " est le seul"} à y
                  croire. Si ça passe, on n&apos;a pas fini d&apos;en entendre parler.
                </p>
              </div>
            )}
          </>
        )}

        {mine?.score && (
          <Link
            href={`/match/${fixture.id}/points`}
            className="mt-1 rounded-full border border-line-strong py-3.5 text-center text-[15px] font-bold text-ink"
          >
            Pourquoi {mine.score.points} point{mine.score.points > 1 ? "s" : ""} ?
          </Link>
        )}
      </div>
    </div>
  );
}
