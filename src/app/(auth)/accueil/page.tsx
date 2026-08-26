import type { Metadata } from "next";
import Link from "next/link";
import { Card, CompetitionLogo, Label } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/lib/auth/session";
import { loadMyLeagues } from "@/lib/leagues/queries.ts";

export const metadata: Metadata = { title: "Accueil" };
export const dynamic = "force-dynamic";

export default async function AccueilPage() {
  const viewer = await requireViewer();
  const sb = await createClient();
  const leagues = await loadMyLeagues(sb, viewer.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-3xl tracking-tight text-ink">
          Salut {viewer.firstName} 👋
        </h1>
        <p className="text-ink-muted">
          {leagues.length === 0
            ? "Tu n'es dans aucune ligue pour l'instant."
            : "Choisis une ligue, ou rejoins-en une nouvelle."}
        </p>
      </div>

      {leagues.length > 0 && (
        <section className="flex flex-col gap-2">
          <Label>Mes ligues</Label>
          <div className="flex flex-col gap-2">
            {leagues.map((l) => (
              <Link
                key={l.leagueId}
                href={`/journee?league=${l.leagueId}`}
                className="block rounded-[var(--radius-card)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition active:scale-[0.995]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <CompetitionLogo name={l.competitionName} logoUrl={l.competitionLogoUrl} size={36} />
                    <div className="flex flex-col gap-0.5">
                      <span className="font-display text-lg text-ink">{l.leagueName}</span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                        {l.competitionName}
                      </span>
                    </div>
                  </div>
                  <span className="text-ink-faint">→</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-2.5">
        <Link
          href="/ligues/rejoindre"
          className="rounded-full bg-clay px-5 py-4 text-center text-[16px] font-bold text-white"
        >
          Rejoindre une ligue
        </Link>
        <Link
          href="/ligues/creer"
          className="rounded-full border border-line-strong px-5 py-4 text-center text-[16px] font-bold text-ink"
        >
          Créer une ligue
        </Link>
      </div>

      <Card className="p-4">
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Une ligue rassemble un groupe de joueurs autour d&apos;une seule compétition : son
          propre classement, ses propres membres. Tu peux appartenir à plusieurs ligues à la fois.
        </p>
      </Card>
    </div>
  );
}
