import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/lib/auth/session";
import { loadJoinableCompetitions } from "@/lib/leagues/queries.ts";
import { CreateLeagueForm } from "./create-form";

export const metadata: Metadata = { title: "Créer une ligue" };
export const dynamic = "force-dynamic";

export default async function CreerLiguePage() {
  await requireViewer();
  const sb = await createClient();
  const competitions = await loadJoinableCompetitions(sb);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Link href="/accueil" className="w-fit text-[13px] font-semibold text-ink-muted">
          ← Accueil
        </Link>
        <h1 className="font-display text-3xl tracking-tight text-ink">Créer une ligue</h1>
        <p className="text-ink-muted">
          Une clé unique sera générée : tu pourras la partager avec tes amis.
        </p>
      </div>

      {competitions.length === 0 ? (
        <p className="text-ink-muted">Aucune compétition n&apos;est encore jouable.</p>
      ) : (
        <CreateLeagueForm competitions={competitions} />
      )}
    </div>
  );
}
