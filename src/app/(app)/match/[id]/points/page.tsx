import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/session";
import { loadClubAvatars } from "@/lib/auth/avatar-policy";
import { loadMatchCenter, loadSeasonForRound } from "@/lib/standings/queries";
import { loadRuleset } from "@/lib/settings";
import { PlayerAvatar } from "../../../_components/player-avatar";
import type { ScoreLevel } from "@/lib/types";

export const metadata: Metadata = { title: "Pourquoi ces points" };
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

const LADDER: { level: ScoreLevel; label: string }[] = [
  { level: "wrong", label: "Mauvais vainqueur" },
  { level: "winner", label: "Bon vainqueur" },
  { level: "winner_and_margin", label: "Bonne tranche d'écart" },
  { level: "exact_score", label: "Score exact" },
];

const RANK: Record<ScoreLevel, number> = {
  wrong: 0, winner: 1, winner_and_margin: 2, exact_score: 3,
};

const TITLES: Record<ScoreLevel, string> = {
  wrong: "Mauvais camp",
  winner: "Bon vainqueur",
  winner_and_margin: "Bon vainqueur, bonne tranche",
  exact_score: "Score exact",
};

export default async function PointsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();

  const viewer = await getViewer();
  if (!viewer) redirect("/connexion");

  const sb = await createClient();
  const [data, clubs] = await Promise.all([
    loadMatchCenter(sb, parsed.data, viewer.id),
    loadClubAvatars(sb),
  ]);
  if (!data) notFound();
  // La saison vient du match lui-même, jamais d'une compétition par défaut :
  // plusieurs ligues, sur des compétitions différentes, vivent en même temps.
  const season = await loadSeasonForRound(sb, data.fixture.roundId);
  const mine = data.mine;
  // Sans note, il n'y a rien à expliquer : le Match Center suffit.
  if (!mine?.score) redirect(`/match/${parsed.data}`);
  const score = mine.score;

  const ruleset = season ? await loadRuleset(sb, season.id) : null;
  const { fixture } = data;
  const reached = RANK[score.level];

  const actualMargin =
    fixture.homeScore !== null && fixture.awayScore !== null
      ? Math.abs(fixture.homeScore - fixture.awayScore)
      : null;
  const actualBucket =
    actualMargin !== null && ruleset
      ? ruleset.buckets.find(
          (b) => actualMargin >= b.minPoints && (b.maxPoints === null || actualMargin <= b.maxPoints),
        )
      : undefined;

  const won =
    mine.outcome === "home" ? fixture.homeTeam.shortName
    : mine.outcome === "away" ? fixture.awayTeam.shortName
    : "Nul";

  const positive = score.level !== "wrong";

  return (
    <div className="flex min-h-[70dvh] flex-col gap-3.5">
      <header className="flex items-center gap-3">
        <Link
          href={`/match/${fixture.id}`}
          aria-label="Retour au match"
          className="grid size-[38px] shrink-0 place-items-center rounded-full border border-line-strong text-ink-muted"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
          </svg>
        </Link>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            {fixture.status === "official" || fixture.status === "finished" ? "Terminé" : "En cours"}
          </span>
          <span className="truncate text-[16px] font-bold text-ink">
            {fixture.homeTeam.shortName} {fixture.homeScore ?? "–"} – {fixture.awayScore ?? "–"} {fixture.awayTeam.shortName}
          </span>
        </div>
      </header>

      {/* Le verdict */}
      <section
        className={`flex items-center gap-4 rounded-[28px] p-5 ${
          positive ? "bg-winner-soft" : "bg-wrong-soft"
        }`}
      >
        <div
          className={`flex size-[76px] shrink-0 flex-col items-center justify-center rounded-full ${
            positive ? "bg-winner" : "bg-wrong"
          } text-surface`}
        >
          <span className="tabular text-[30px] font-extrabold leading-none">{score.points}</span>
          <span className="font-mono text-[10px] tracking-[0.1em]">
            {score.points > 1 ? "POINTS" : "POINT"}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <span className={`font-display text-[20px] leading-tight ${positive ? "text-winner" : "text-wrong"}`}>
            {TITLES[score.level]}
          </span>
          <span className={`text-[12px] leading-snug ${positive ? "text-winner" : "text-wrong"}`}>
            Ton prono : {won}
            {mine.exactHomeScore !== null
              ? `, score exact ${mine.exactHomeScore}-${mine.exactAwayScore}`
              : mine.marginBucketLabel
                ? `, écart ${mine.marginBucketLabel}`
                : ""}
            {mine.isAuto && " 😴 joué automatiquement"}
          </span>
        </div>
      </section>

      {/* La cascade, niveau par niveau */}
      <section className="rounded-[28px] bg-surface px-4.5 py-1.5 shadow-[var(--shadow-card)]">
        {LADDER.map((step, i) => {
          const rank = RANK[step.level];
          const achieved = rank <= reached && !(step.level === "wrong" && positive);
          const isRetained = step.level === score.level;
          const points = ruleset ? ruleset.points[step.level] : null;

          return (
            <div
              key={step.level}
              className={[
                "flex items-center gap-3.5 py-3",
                i < LADDER.length - 1 ? "border-b border-line" : "",
                isRetained ? "-mx-4.5 border-l-4 border-l-winner bg-winner-soft/50 pl-4 pr-4.5" : "",
                !achieved && !isRetained ? "opacity-45" : "",
              ].join(" ")}
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full ${
                  achieved ? "bg-winner text-surface" : "border border-line-strong text-ink-faint"
                }`}
              >
                {achieved ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                )}
              </span>

              <div className="flex flex-1 flex-col gap-0.5">
                <span className={`text-[14px] ${isRetained ? "font-bold text-ink" : "text-ink"}`}>
                  {step.label}
                  {step.level === "winner" && achieved && ` — ${won}`}
                  {step.level === "exact_score" && mine.exactHomeScore === null && " — non tenté"}
                </span>
                {isRetained && (
                  <span className="text-[11px] text-winner">Retenu : le meilleur niveau atteint</span>
                )}
              </div>

              <span
                className={`tabular text-[13px] font-bold ${
                  isRetained ? "text-[15px] font-extrabold text-winner" : achieved ? "text-winner" : "text-ink-faint"
                }`}
              >
                {points}
              </span>
            </div>
          );
        })}
      </section>

      {/* Les chiffres */}
      <section className="flex gap-2.5">
        <div className="flex flex-1 flex-col gap-1 rounded-[16px] bg-surface p-3.5 shadow-[var(--shadow-card)]">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Écart réel
          </span>
          <span className="tabular text-[22px] font-bold text-ink">{actualMargin ?? "—"}</span>
          <span className="text-[11px] text-ink-faint">
            {actualBucket ? `tranche ${actualBucket.label}` : "—"}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1 rounded-[16px] bg-surface p-3.5 shadow-[var(--shadow-card)]">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Ta tranche
          </span>
          <span className={`text-[22px] font-bold ${score.level === "wrong" ? "text-ink-muted" : "text-winner"}`}>
            {mine.marginBucketLabel ?? "—"}
          </span>
          <span className={`text-[11px] ${score.level === "wrong" ? "text-ink-faint" : "text-winner"}`}>
            {actualBucket && mine.marginBucketLabel === actualBucket.label ? "exacte" : "à côté"}
          </span>
        </div>
      </section>

      {/* Le groupe sur ce match */}
      {data.predictions.length > 0 && (
        <section className="flex flex-col gap-3 rounded-[28px] bg-surface p-4 shadow-[var(--shadow-card)]">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            Sur ce match
          </span>
          <div className="flex flex-wrap justify-between gap-2">
            {data.predictions.map((p) => (
              <Link
                key={p.player.userId}
                href={data.leagueId ? `/profil/${p.player.userId}?league=${data.leagueId}` : `/profil/${p.player.userId}`}
                className="flex flex-col items-center gap-1.5"
              >
                <PlayerAvatar player={p.player} clubs={clubs} size={34} />
                <span
                  className={`tabular text-[12px] font-bold ${
                    (p.score?.points ?? 0) > 0 ? "text-winner" : "text-ink-faint"
                  }`}
                >
                  {p.score?.points ?? "—"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex-1" />

      <Link
        href="/regles"
        className="rounded-full border border-line-strong py-4 text-center text-[15px] font-bold text-ink"
      >
        Voir toutes les règles
      </Link>
    </div>
  );
}
