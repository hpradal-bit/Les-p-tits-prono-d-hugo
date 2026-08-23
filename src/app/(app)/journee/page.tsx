import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Label } from "@/components/ui";
import { loadJourneyBoard } from "@/lib/predictions/queries";
import { formatLongDate } from "@/lib/predictions/lock";
import { JourneeBoard } from "./journee-board";
import { Participation } from "./participation";

export const metadata: Metadata = { title: "Ma journée" };

// L'écran dépend de la session et de l'heure : il se calcule à chaque visite.
export const dynamic = "force-dynamic";

export default async function JourneePage({
  searchParams,
}: {
  searchParams: Promise<{ j?: string }>;
}) {
  const params = await searchParams;
  const asked = Number.parseInt(params.j ?? "", 10);

  const board = await loadJourneyBoard({
    roundNumber: Number.isFinite(asked) ? asked : undefined,
  });

  if (board === null) {
    // Pas de session : l'authentification est le chantier voisin, on y renvoie.
    redirect("/connexion");
  }

  const { round } = board;
  const date = round.startsAt ? formatLongDate(round.startsAt, board.timeZone) : null;

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-4">
      {/* --- En-tête de journée ------------------------------------------------ */}
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <Label>Top 14 · Saison 2026/2027</Label>
          <nav aria-label="Changer de journée" className="flex items-center gap-1">
            {board.previousRound && (
              <RoundLink
                number={board.previousRound.number}
                label={`← ${board.previousRound.name}`}
              />
            )}
            {board.nextRound && (
              <RoundLink
                number={board.nextRound.number}
                label={`${board.nextRound.name} →`}
              />
            )}
          </nav>
        </div>

        <h1 className="font-display text-3xl tracking-tight text-ink">
          {round.name}
        </h1>
        {date && <p className="text-[13px] text-ink-muted">{date}</p>}
      </header>

      {/* --- Horaires provisoires : le dire, franchement ----------------------- */}
      {board.hasProvisionalKickoffs && (
        <Card className="border-sage/40 bg-sage-soft p-3">
          <p className="text-[13px] leading-relaxed text-ink">
            <span aria-hidden>⏱️</span>{" "}
            <span className="font-semibold">Horaires provisoires.</span> La LNR n&apos;a
            pas encore publié les jours et heures exacts. Les matchs sont affichés au
            samedi 15 h par défaut ; l&apos;heure de verrouillage suivra automatiquement
            dès la publication du calendrier officiel.
          </p>
        </Card>
      )}

      {board.fixtures.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-ink-muted">Aucun match sur cette journée.</p>
        </Card>
      ) : (
        // `key` : changer de journée repart d'une saisie vierge.
        <JourneeBoard key={round.id} board={board} />
      )}

      <Participation rows={board.participation} meId={board.userId} />

      {/* --- Rappel du barème, lu depuis la base ------------------------------- */}
      <Card className="p-4">
        <Label>Ce que ça rapporte</Label>
        <ul className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
          <Rule label="Mauvais vainqueur" points={board.ruleset.points.wrong} />
          <Rule label="Bon vainqueur" points={board.ruleset.points.winner} />
          <Rule
            label="Vainqueur + écart"
            points={board.ruleset.points.winner_and_margin}
          />
          <Rule label="Score exact 👌" points={board.ruleset.points.exact_score} />
        </ul>
        <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-faint">
          Tenter un score exact ne fait jamais perdre de points : la tranche d&apos;écart
          en est déduite automatiquement.
        </p>
      </Card>
    </main>
  );
}

function RoundLink({ number, label }: { number: number; label: string }) {
  return (
    <Link
      href={`/journee?j=${number}`}
      className="rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-[11px] text-ink-muted transition hover:text-ink"
    >
      {label}
    </Link>
  );
}

function Rule({ label, points }: { label: string; points: number }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-surface-sunk px-2.5 py-1.5">
      <span className="truncate text-ink-muted">{label}</span>
      <span className="tabular shrink-0 font-mono text-[12px] font-semibold text-ink">
        {points}
      </span>
    </li>
  );
}
