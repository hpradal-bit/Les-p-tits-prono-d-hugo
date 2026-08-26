import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Card } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/lib/auth/session";
import { resolveLeagueId } from "@/lib/leagues/queries.ts";
import { loadActiveSeason } from "@/lib/standings/queries";
import { listQuestions, getQuestionView } from "@/lib/bonus/queries";
import { QuestionCard } from "./_components/question-card";

export const metadata: Metadata = { title: "Questions bonus" };
export const dynamic = "force-dynamic";

const params = z.object({ league: z.string().uuid().optional() });

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const viewer = await requireViewer();
  const sb = await createClient();
  const { league: requested } = params.catch({}).parse(await searchParams);
  const resolved = await resolveLeagueId(sb, viewer.id, requested);
  if (!resolved) redirect("/accueil");

  const admin = createAdminClient();
  const season = await loadActiveSeason(admin, resolved.leagueId);
  if (!season) {
    return (
      <Card className="p-8 text-center">
        <p className="text-ink-muted">Aucune saison pour cette ligue.</p>
      </Card>
    );
  }
  const seasonId = season.id;

  const all = await listQuestions(admin, seasonId);
  const visible = all.filter((q) => q.status !== "draft");

  const views = await Promise.all(
    visible.map((q) => getQuestionView(admin, q.id, viewer.id)),
  );

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name")
    .eq("is_active", true);
  const namesById = new Map<string, string>();
  for (const p of (profiles ?? []) as Array<{ id: string; first_name: string }>) {
    namesById.set(p.id, p.first_name);
  }

  const openViews = views.filter((v) => v && (v.question.status === "open"));
  const closedViews = views.filter((v) => v && (v.question.status === "closed" || v.question.status === "settled"));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          Bonus · {season.competitionName}
        </span>
        <h1 className="font-display text-[32px] leading-none text-ink">
          Questions bonus
        </h1>
      </header>

      {resolved.leagues.length > 1 && (
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {resolved.leagues.map((l) => (
            <Link
              key={l.leagueId}
              href={`/questions?league=${l.leagueId}`}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                l.leagueId === resolved.leagueId
                  ? "bg-clay text-surface"
                  : "border border-line bg-surface text-ink-muted"
              }`}
            >
              {l.leagueName}
            </Link>
          ))}
        </div>
      )}

      {openViews.length === 0 && closedViews.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-ink-muted">Aucune question bonus pour le moment.</p>
        </Card>
      ) : (
        <>
          {openViews.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                En cours ({openViews.length})
              </p>
              {openViews.map((v) =>
                v ? <QuestionCard key={v.question.id} view={v} namesById={namesById} /> : null,
              )}
            </section>
          )}

          {closedViews.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                Terminées ({closedViews.length})
              </p>
              {closedViews.map((v) =>
                v ? <QuestionCard key={v.question.id} view={v} namesById={namesById} /> : null,
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
