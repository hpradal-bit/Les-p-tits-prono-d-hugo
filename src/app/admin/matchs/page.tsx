import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Card, Label } from "@/components/ui";
import { loadRounds, loadRoundFixtures } from "@/lib/admin/queries";
import { ResultForm } from "./_components/result-form";
import { RecomputeForm } from "./_components/recompute-form";

export const metadata: Metadata = { title: "Matchs" };
export const dynamic = "force-dynamic";

const params = z.object({ j: z.coerce.number().int().min(1).max(30).optional() });

function formatKickoff(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: "short", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
  });
}

export default async function AdminMatchsPage({
  searchParams,
}: {
  searchParams: Promise<{ j?: string }>;
}) {
  const rounds = await loadRounds();
  const { j } = params.catch({}).parse(await searchParams);

  // Par défaut : la première journée non clôturée, celle qui nous occupe.
  const current =
    rounds.find((r) => r.number === j) ??
    rounds.find((r) => r.status !== "settled") ??
    rounds[0];

  if (!current) {
    return (
      <Card className="p-8 text-center">
        <p className="text-ink-muted">Aucune journée en base.</p>
      </Card>
    );
  }

  const fixtures = await loadRoundFixtures(current.id);
  const withResult = fixtures.filter((f) => f.homeScore !== null).length;

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-sage/40 bg-sage-soft p-4">
        <p className="text-[14px] leading-relaxed text-ink">
          La saisie manuelle est le filet de sécurité : si la synchronisation
          tombe un samedi soir, sept scores tapés ici suffisent à faire tomber
          les points. Chaque enregistrement <strong>recalcule aussitôt</strong> les
          pronostics du match et laisse une trace dans le journal.
        </p>
      </Card>

      <div className="flex flex-wrap gap-1.5">
        {rounds.map((r) => (
          <Link
            key={r.id}
            href={`/admin/matchs?j=${r.number}`}
            className={`rounded-full px-3 py-1 font-mono text-[12px] font-semibold ${
              r.id === current.id
                ? "bg-clay text-white"
                : "border border-line bg-surface text-ink-muted hover:bg-surface-sunk"
            }`}
          >
            J{r.number}
          </Link>
        ))}
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink">{current.name}</h2>
          <Label>
            {withResult} / {fixtures.length} résultats saisis
          </Label>
        </div>
        <RecomputeForm roundId={current.id} />
      </div>

      <ul className="flex flex-col gap-3">
        {fixtures.map((f) => (
          <li key={f.id}>
            <Card className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-mono text-[12px] text-ink-muted">
                  {formatKickoff(f.kickoffAt)}
                  {!f.kickoffConfirmed && (
                    <span className="text-sage"> · horaire provisoire</span>
                  )}
                </p>
                <p className="font-mono text-[11px] text-ink-faint">
                  {f.scoredCount}/{f.predictionCount} prono{f.predictionCount > 1 ? "s" : ""} scoré
                  {f.scoredCount > 1 ? "s" : ""}
                </p>
              </div>
              <ResultForm fixture={f} />
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
