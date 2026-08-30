import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Card, CompetitionLogo } from "@/components/ui";
import { LeagueSwitcher } from "@/components/league-switcher";
import { loadJourneyBoard } from "@/lib/predictions/queries";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLeagueId } from "@/lib/leagues/queries.ts";
import { listOpenQuestionsWithAnswer } from "@/lib/bonus/queries";
import { loadActivePowers, loadUserTokens, loadRoundUsages } from "@/lib/powers/queries";
import { getPower } from "@/lib/powers/registry";
import { creditCost, powerEffect, powerRules, FALLBACK_CREDIT_COST } from "@/lib/powers/credits";
import { loadSettings, setting } from "@/lib/settings";
import { PlayerAvatar } from "../_components/player-avatar";
import { NotificationPrompt } from "../_components/notification-prompt";
import { getViewer } from "@/lib/auth/session";
import { MatchCard } from "./_components/match-card";
import { PredictionsBoard } from "./_components/predictions-board";
import { BonusBanner } from "./_components/bonus-banner";
import { PowerBanner } from "./_components/power-banner";
import { RoundNav } from "./_components/round-nav";
import { Countdown } from "./_components/countdown";

export const metadata: Metadata = { title: "Ma journée" };
export const dynamic = "force-dynamic";

const params = z.object({
  j: z.coerce.number().int().min(1).max(30).optional(),
  league: z.string().uuid().optional(),
});

export default async function JourneePage({
  searchParams,
}: {
  searchParams: Promise<{ j?: string; league?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/connexion");

  const sb = await createClient();
  const { j, league: requested } = params.catch({}).parse(await searchParams);
  const resolved = await resolveLeagueId(sb, viewer.id, requested);
  if (!resolved) redirect("/accueil");
  const { leagueId, leagues: myLeagues } = resolved;

  const board = await loadJourneyBoard({ userId: viewer.id, roundNumber: j, leagueId });
  const admin = createAdminClient();

  const ligueOptions = myLeagues.map((l) => ({
    value: l.leagueId,
    label: l.leagueName,
    href: `/journee?league=${l.leagueId}`,
  }));

  if (!board) {
    return (
      <div className="flex flex-col gap-3.5">
        <LeagueSwitcher options={ligueOptions} current={leagueId} />
        <Card className="p-8 text-center">
          <p className="text-ink-muted">Rien à afficher pour cette ligue pour l&apos;instant.</p>
        </Card>
      </div>
    );
  }

  const seasonId = board.seasonId;
  const currentRoundId = board.round.id;

  const [allBonusItems, activePowers, userTokens, roundUsages, allProfiles, appSettings] = await Promise.all([
    listOpenQuestionsWithAnswer(admin, seasonId, viewer.id),
    loadActivePowers(admin),
    loadUserTokens(admin, viewer.id, seasonId),
    loadRoundUsages(admin, currentRoundId),
    admin.from("profiles").select("id, display_name, first_name").eq("is_active", true),
    loadSettings(admin),
  ]);

  const vapidKey = setting<string>(appSettings, "push_notifications.vapid_public_key", "");

  const bonusItems = allBonusItems.filter(
    (b) => !b.question.roundId || b.question.roundId === currentRoundId,
  );

  const tokensAvailable = userTokens.filter((t) => t.status === "available").length;
  const myUsage = roundUsages.find(
    (u) => u.initiatorId === viewer.id && (u.state === "declared" || u.state === "accepted"),
  );

  const profiles = ((allProfiles.data ?? []) as Array<{ id: string; display_name: string; first_name: string }>);
  const fallbackCost = setting<number>(
    appSettings,
    "powers.default_credit_cost",
    FALLBACK_CREDIT_COST,
  );

  const powerOptions = activePowers.map((p) => {
    const pk = getPower(p.code);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      emoji: p.emoji,
      needsTarget: pk?.needsTarget ?? false,
      needsFixture: pk?.needsFixture ?? false,
      cost: creditCost(p, fallbackCost),
      description: p.description,
      effect: powerEffect(p),
      rules: powerRules(p),
    };
  });

  const fixtureOptions = board.fixtures.map((f) => ({
    id: f.fixture.id,
    label: `${f.fixture.homeTeam.shortName} - ${f.fixture.awayTeam.shortName}`,
  }));

  const playerOptions = profiles.map((p, i) => ({
    userId: p.id,
    displayName: p.display_name,
    position: i + 1,
  }));

  const activeUsageData = myUsage
    ? {
        id: myUsage.id,
        powerCode: myUsage.powerCode,
        powerEmoji: activePowers.find((p) => p.id === myUsage.powerId)?.emoji ?? "⚡",
        powerName: activePowers.find((p) => p.id === myUsage.powerId)?.name ?? myUsage.powerCode,
        targetName: myUsage.targetId
          ? profiles.find((p) => p.id === myUsage.targetId)?.display_name ?? null
          : null,
        fixtureName: myUsage.snapshotBefore.fixtureId
          ? fixtureOptions.find((f) => f.id === myUsage.snapshotBefore.fixtureId)?.label ?? null
          : null,
        cost:
          typeof myUsage.snapshotBefore.creditCost === "number"
            ? myUsage.snapshotBefore.creditCost
            : 1,
      }
    : null;

  const toPlay = board.fixtures.filter(
    (f) => !f.isLocked && f.fixture.status !== "finished" && f.fixture.status !== "official",
  );
  const live = board.fixtures.filter((f) => f.fixture.status === "live");
  const done = board.fixtures.filter(
    (f) => f.fixture.status === "finished" || f.fixture.status === "official",
  );
  const locked = board.fixtures.filter(
    (f) => f.isLocked && f.fixture.status !== "live" && f.fixture.status !== "finished" && f.fixture.status !== "official",
  );

  const totalPoints = board.fixtures.reduce((sum, f) => sum + (f.score?.points ?? 0), 0);

  return (
    <div className="flex flex-col gap-3.5">
      <LeagueSwitcher options={ligueOptions} current={leagueId} />

      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            <CompetitionLogo name={board.competitionName} logoUrl={board.competitionLogoUrl} size={16} />
            {board.round.name} · {board.competitionName}
          </span>
          <h1 className="font-display text-[32px] leading-none text-ink">
            Salut {viewer.firstName} 👋
          </h1>
          <Link
            href={`/regles?league=${board.leagueId}`}
            className="mt-0.5 w-fit text-[12.5px] font-semibold text-clay underline"
          >
            Comment on joue ?
          </Link>
        </div>
        <Link href="/profil">
          <PlayerAvatar
            player={{
              userId: viewer.id,
              firstName: viewer.firstName,
              displayName: viewer.displayName,
              avatarKind: viewer.avatarKind,
              avatarValue: viewer.avatarValue,
            }}
            size={48}
          />
        </Link>
      </header>

      <RoundNav rounds={board.allRounds} currentNumber={board.round.number} leagueId={board.leagueId} />

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-clay-soft px-3 py-1.5 text-[12px] font-semibold text-clay">
          {board.fixtures.length} match{board.fixtures.length > 1 ? "s" : ""}
          {board.hasProvisionalKickoffs && " · horaires provisoires"}
        </span>
        {board.nextLockAt && <Countdown targetIso={board.nextLockAt} />}
        {done.length > 0 && (
          <span className="rounded-full bg-winner-soft px-3 py-1.5 text-[12px] font-semibold text-winner">
            {totalPoints} pt{totalPoints > 1 ? "s" : ""} marqué{totalPoints > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {vapidKey && <NotificationPrompt vapidPublicKey={vapidKey} />}

      <BonusBanner items={bonusItems} leagueId={board.leagueId} />

      <PowerBanner
        powers={powerOptions}
        tokensAvailable={tokensAvailable}
        roundId={currentRoundId}
        fixtures={fixtureOptions}
        players={playerOptions}
        activeUsage={activeUsageData}
        viewerId={viewer.id}
      />

      {board.fixtures.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-ink-muted">Aucun match sur cette journée.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {toPlay.length > 0 && (
            <MatchSection title="À jouer" count={toPlay.length}>
              <PredictionsBoard
                fixtures={toPlay}
                ruleset={board.ruleset}
                timeZone={board.timeZone}
                roundId={currentRoundId}
                seasonId={seasonId}
                otherAttempts={board.otherAttempts}
              />
            </MatchSection>
          )}

          {locked.length > 0 && (
            <MatchSection title="Verrouillés" count={locked.length}>
              {locked.map((item) => (
                <MatchCard key={item.fixture.id} item={item} ruleset={board.ruleset} timeZone={board.timeZone} />
              ))}
            </MatchSection>
          )}

          {live.length > 0 && (
            <MatchSection title="En cours" count={live.length}>
              {live.map((item) => (
                <MatchCard key={item.fixture.id} item={item} ruleset={board.ruleset} timeZone={board.timeZone} />
              ))}
            </MatchSection>
          )}

          {done.length > 0 && (
            <MatchSection title="Terminés" count={done.length}>
              {done.map((item) => (
                <MatchCard key={item.fixture.id} item={item} ruleset={board.ruleset} timeZone={board.timeZone} />
              ))}
            </MatchSection>
          )}
        </div>
      )}

      {board.remainingToPlay > 0 && (
        <a
          href={`#fixture-${board.fixtures.find((f) => !f.isLocked && !f.draft)?.fixture.id ?? board.fixtures[0].fixture.id}`}
          className="sticky bottom-24 mt-1 rounded-full bg-clay px-5 py-4 text-center text-[16px] font-bold text-surface shadow-[var(--shadow-lift)]"
        >
          Faire mes pronos · {board.remainingToPlay} restant{board.remainingToPlay > 1 ? "s" : ""}
        </a>
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

function MatchSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          {title}
        </h2>
        <span className="rounded-full bg-surface-sunk px-2 py-0.5 text-[10px] font-bold text-ink-faint">
          {count}
        </span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {Array.isArray(children)
          ? children.map((child, i) => <li key={i}>{child}</li>)
          : <li>{children}</li>
        }
      </ul>
    </section>
  );
}
