import Link from "next/link";
/**
 * Match Center : le score, le statut, et surtout ce que chaque joueur avait
 * pronostiqué, avec les points obtenus et la raison.
 *
 * Confidentialité : rien n'est montré avant `fixtures.locks_at`. Ce n'est pas
 * qu'un choix d'affichage — la politique RLS `predictions_read` ne renvoie tout
 * simplement pas les pronostics des autres avant le verrouillage.
 */

import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, Label } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { loadMatchCenter } from "@/lib/standings/queries";
import { formatDateTime, hasResult } from "@/lib/standings/format";
import { Scoreboard } from "../_components/scoreboard";
import { PredictionRow } from "../_components/prediction-row";

const ParamsSchema = z.object({ id: z.string().uuid() });

export const metadata = { title: "Match" };

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  const data = await loadMatchCenter(sb, parsed.data.id, user?.id ?? null);
  if (!data) notFound();

  const { fixture, predictions, mine, isLocked } = data;
  const played = hasResult(fixture.status, fixture.homeScore);
  const scored = predictions.filter((p) => p.score !== null);
  const totalPoints = scored.reduce((sum, p) => sum + (p.score?.points ?? 0), 0);
  const exactCount = scored.filter((p) => p.score?.level === "exact_score").length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Label>Match Center</Label>
        <h1 className="font-display text-2xl leading-tight tracking-tight text-ink">
          {fixture.homeTeam.shortName} — {fixture.awayTeam.shortName}
        </h1>
      </header>

      <Scoreboard fixture={fixture} />

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label>Les pronos du groupe</Label>
          {isLocked && scored.length > 0 && (
            <p className="tabular font-mono text-[11px] text-ink-faint">
              {totalPoints} pt{Math.abs(totalPoints) > 1 ? "s" : ""} distribué
              {Math.abs(totalPoints) > 1 ? "s" : ""}
              {exactCount > 0 ? ` · 👌 ${exactCount} score${exactCount > 1 ? "s" : ""} exact${exactCount > 1 ? "s" : ""}` : ""}
            </p>
          )}
        </div>

        {!isLocked ? (
          <Card className="flex flex-col gap-3 p-5">
            <p className="text-sm leading-relaxed text-ink-muted">
              🔒 Les pronostics restent secrets jusqu&apos;au verrouillage, le{" "}
              {formatDateTime(fixture.locksAt)}. Personne ne peut voir ceux des autres avant —
              pas même en interrogeant l&apos;API : la base elle-même les refuse.
            </p>
            {mine ? (
              <ul className="-mx-5 -mb-5 border-t border-line">
                <PredictionRow prediction={mine} fixture={fixture} isViewer />
              </ul>
            ) : (
              <p className="text-sm text-ink-faint">
                Tu n&apos;as pas encore pronostiqué ce match.
              </p>
            )}
          </Card>
        ) : predictions.length === 0 ? (
          <Card className="p-5 text-sm text-ink-muted">
            Personne n&apos;a pronostiqué ce match.
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {predictions.map((prediction) => (
                <PredictionRow
                  key={prediction.player.userId}
                  prediction={prediction}
                  fixture={fixture}
                  isViewer={prediction.player.userId === user?.id}
                />
              ))}
            </ul>
          </Card>
        )}

        {isLocked && !played && (
          <p className="font-mono text-[11px] leading-relaxed text-ink-faint">
            Les points seront calculés dès la publication du score.
          </p>
        )}
        {played && fixture.status !== "official" && (
          <p className="font-mono text-[11px] leading-relaxed text-ink-faint">
            Score non encore officiel : les points peuvent bouger si le résultat est corrigé.
          </p>
        )}
      </section>
        {data.mine?.score && (
        <Link
          href={`/match/${data.fixture.id}/points`}
          className="rounded-full border border-line-strong py-3.5 text-center text-[15px] font-bold text-ink"
        >
          Pourquoi {data.mine.score.points} point{data.mine.score.points > 1 ? "s" : ""} ?
        </Link>
      )}
      </div>
  );
}
