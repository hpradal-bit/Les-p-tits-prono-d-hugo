import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Card, Label } from "@/components/ui";
import { LeagueSwitcher } from "@/components/league-switcher";
import { RoundBanner } from "../_components/round-banner";
import { MatchCard } from "../journee/_components/match-card";
import { QuestionCard } from "../questions/_components/question-card";
import { getViewer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLeagueId } from "@/lib/leagues/queries.ts";
import { loadJourneyBoard } from "@/lib/predictions/queries";
import { listQuestions, getQuestionView } from "@/lib/bonus/queries";
import type { BonusQuestionView } from "@/lib/bonus/types";

export const metadata: Metadata = { title: "Résultats" };
export const dynamic = "force-dynamic";

const params = z.object({ league: z.string().uuid().optional() });

export default async function ResultatsPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/connexion");

  const sb = await createClient();
  const { league: requested } = params.catch({}).parse(await searchParams);
  const resolved = await resolveLeagueId(sb, viewer.id, requested);
  if (!resolved) redirect("/accueil");
  const { leagueId, leagues: myLeagues } = resolved;

  const ligueOptions = myLeagues.map((l) => ({
    value: l.leagueId,
    label: l.leagueName,
    href: `/resultats?league=${l.leagueId}`,
  }));

  const board = await loadJourneyBoard({ userId: viewer.id, leagueId });

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

  const admin = createAdminClient();

  // Les questions bonus réglées, avec le même luxe de détail que /questions
  // (qui a répondu quoi, la bonne réponse, les points) — réutilisées telles
  // quelles plutôt que reconstruites : QuestionCard fait déjà exactement ça.
  const allQuestions = await listQuestions(admin, board.seasonId);
  const settled = allQuestions.filter((q) => q.status === "settled");
  const settledViews = (
    await Promise.all(settled.map((q) => getQuestionView(admin, q.id, viewer.id)))
  ).filter((v): v is NonNullable<typeof v> => v !== null);

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name")
    .eq("is_active", true);
  const namesById = new Map<string, string>();
  for (const p of (profiles ?? []) as Array<{ id: string; first_name: string }>) {
    namesById.set(p.id, p.first_name);
  }

  const bonusByRound = new Map<string, BonusQuestionView[]>();
  const bonusSeasonWide: BonusQuestionView[] = [];
  for (const v of settledViews) {
    if (v.question.roundId) {
      const list = bonusByRound.get(v.question.roundId) ?? [];
      list.push(v);
      bonusByRound.set(v.question.roundId, list);
    } else {
      bonusSeasonWide.push(v);
    }
  }

  // Une journée « Résultats » : au moins un match terminé — le reste de la
  // saison (à jouer, à venir) vit dans Mes pronos, pas ici. La plus récente
  // en premier : c'est ce qu'on vient de jouer qui intéresse le plus.
  const roundsWithResults = board.seasonRounds
    .map((sr) => ({
      seasonRound: sr,
      doneFixtures: sr.fixtures.filter(
        (f) => f.fixture.status === "finished" || f.fixture.status === "official",
      ),
      bonus: bonusByRound.get(sr.round.id) ?? [],
    }))
    .filter((r) => r.doneFixtures.length > 0 || r.bonus.length > 0)
    .reverse();

  return (
    <div className="flex flex-col gap-3.5">
      <LeagueSwitcher options={ligueOptions} current={leagueId} />

      <header className="flex flex-col gap-1">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          {board.competitionName}
        </span>
        <h1 className="font-display text-[32px] leading-none text-ink">Résultats</h1>
        <p className="text-[13px] text-ink-muted">
          Ce qui est terminé, et ce que ça a rapporté.
        </p>
      </header>

      {bonusSeasonWide.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <Label>Questions bonus de la saison</Label>
          {bonusSeasonWide.map((v) => (
            <QuestionCard key={v.question.id} view={v} namesById={namesById} />
          ))}
        </section>
      )}

      {roundsWithResults.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-ink-muted">
            Rien de terminé pour le moment — reviens après les premiers matchs.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {roundsWithResults.map(({ seasonRound, doneFixtures, bonus }) => (
            <section key={seasonRound.round.id} className="flex flex-col gap-2.5">
              <RoundBanner seasonRound={seasonRound} timeZone={board.timeZone} />
              <ul className="flex flex-col gap-2.5">
                {doneFixtures.map((item) => (
                  <li key={item.fixture.id}>
                    <MatchCard item={item} ruleset={board.ruleset} timeZone={board.timeZone} />
                  </li>
                ))}
              </ul>
              {bonus.map((v) => (
                <QuestionCard key={v.question.id} view={v} namesById={namesById} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
