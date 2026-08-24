import type { Metadata } from "next";
import { Card, Label } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentSeasonId } from "@/lib/admin/queries";
import { listQuestions } from "@/lib/bonus/queries";
import { CreateForm } from "./_components/create-form";
import { QuestionCard } from "./_components/question-actions";

export const metadata: Metadata = { title: "Questions bonus — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminBonusPage() {
  const admin = createAdminClient();
  const seasonId = await currentSeasonId(admin);
  const questions = await listQuestions(admin, seasonId);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <Label>Nouvelle question</Label>
        <Card className="p-4">
          <CreateForm />
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
