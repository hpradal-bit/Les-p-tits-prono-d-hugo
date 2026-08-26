import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Card, Label } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/lib/auth/session";
import { resolveLeagueId } from "@/lib/leagues/queries.ts";
import { loadActiveSeason } from "@/lib/standings/queries";
import { listQuestions } from "@/lib/bonus/queries";
import { CreateForm } from "./_components/create-form";
import { QuestionCard } from "./_components/question-actions";

export const metadata: Metadata = { title: "Questions bonus — Admin" };
export const dynamic = "force-dynamic";

const params = z.object({ league: z.string().uuid().optional() });

export default async function AdminBonusPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const viewer = await requireViewer();
  const sb = await createClient();
  const { league: requested } = params.catch({}).parse(await searchParams);
  const resolved = await resolveLeagueId(sb, viewer.id, requested);
  if (!resolved) redirect("/accueil");
  const { leagueId, leagues: myLeagues } = resolved;

  const admin = createAdminClient();
  const season = await loadActiveSeason(admin, leagueId);
  if (!season) {
    return (
      <Card className="p-6 text-center">
        <p className="text-ink-muted">Aucune saison pour cette ligue.</p>
      </Card>
    );
  }
  const seasonId = season.id;
  const questions = await listQuestions(admin, seasonId);

  const [{ data: seasonTeams }, { data: rounds }] = await Promise.all([
    admin
      .from("season_teams")
      .select("teams(id, name)")
      .eq("season_id", seasonId),
    admin
      .from("rounds")
      .select("id, name, number")
      .eq("season_id", seasonId)
      .order("number", { ascending: true }),
  ]);

  const teams: { value: string; label: string }[] = (seasonTeams ?? [])
    .map((st) => {
      const t = st.teams as unknown as { id: string; name: string } | null;
      return t ? { value: t.id, label: t.name } : null;
    })
    .filter((t): t is { value: string; label: string } => t !== null)
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

  return (
    <div className="flex flex-col gap-6">
      {myLeagues.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {myLeagues.map((l) => (
            <Link
              key={l.leagueId}
              href={`/admin/bonus?league=${l.leagueId}`}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                l.leagueId === leagueId
                  ? "bg-clay text-surface"
                  : "border border-line bg-surface text-ink-muted"
              }`}
            >
              {l.leagueName}
            </Link>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <Label>Nouvelle question · {season.competitionName}</Label>
        <Card className="p-4">
          <CreateForm
          leagueId={leagueId}
          teams={teams}
          rounds={(rounds ?? []).map((r) => ({
            id: r.id as string,
            name: r.name as string,
            number: r.number as number,
          }))}
        />
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <Label>
          Questions ({questions.length})
        </Label>
        {questions.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-ink-muted">Aucune question bonus pour cette saison.</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {questions.map((q) => (
              <li key={q.id}>
                <QuestionCard question={q} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
