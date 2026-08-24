import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireViewer } from "@/lib/auth/session";
import { currentSeasonId } from "@/lib/admin/queries";
import { listQuestions, getQuestionView } from "@/lib/bonus/queries";
import { QuestionCard } from "./_components/question-card";

export const metadata: Metadata = { title: "Questions bonus" };
export const dynamic = "force-dynamic";

export default async function QuestionsPage() {
  const viewer = await requireViewer();
  const admin = createAdminClient();
  const seasonId = await currentSeasonId(admin);

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
          Bonus
        </span>
        <h1 className="font-display text-[32px] leading-none text-ink">
          Questions bonus
        </h1>
      </header>

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
