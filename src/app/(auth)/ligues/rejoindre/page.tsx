import type { Metadata } from "next";
import Link from "next/link";
import { CompetitionLogo, Label } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/lib/auth/session";
import { loadCatalogue } from "@/lib/leagues/queries.ts";

export const metadata: Metadata = { title: "Rejoindre une ligue" };
export const dynamic = "force-dynamic";

export default async function CatalogueLiguesPage() {
  await requireViewer();
  const sb = await createClient();
  const sports = await loadCatalogue(sb);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Link href="/accueil" className="w-fit text-[13px] font-semibold text-ink-muted">
          ← Accueil
        </Link>
        <h1 className="font-display text-3xl tracking-tight text-ink">Rejoindre une ligue</h1>
        <p className="text-ink-muted">Choisis d&apos;abord la compétition.</p>
      </div>

      <div className="flex flex-col gap-5">
        {sports.map((sport) => (
          <section key={sport.code} className="flex flex-col gap-2">
            <Label>{sport.name}</Label>
            <div className="flex flex-col gap-1.5">
              {sport.competitions.map((c) =>
                c.playable ? (
                  <Link
                    key={c.code}
                    href={`/ligues/rejoindre/${c.code}`}
                    className="flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 shadow-[var(--shadow-card)] transition active:scale-[0.995]"
                  >
                    <span className="flex items-center gap-2.5">
                      <CompetitionLogo name={c.name} logoUrl={c.logoUrl} size={28} />
                      <span className="font-semibold text-ink">{c.name}</span>
                    </span>
                    <span className="text-ink-faint">→</span>
                  </Link>
                ) : (
                  <div
                    key={c.code}
                    aria-disabled
                    className="flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface-sunk px-4 py-3 opacity-55"
                  >
                    <span className="flex items-center gap-2.5">
                      <CompetitionLogo name={c.name} logoUrl={c.logoUrl} size={28} />
                      <span className="font-semibold text-ink-muted">{c.name}</span>
                    </span>
                    <span aria-hidden>🔒</span>
                  </div>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
