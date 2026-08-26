import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/lib/auth/session";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Rejoindre une ligue" };
export const dynamic = "force-dynamic";

export default async function JoinCompetitionPage({
  params,
}: {
  params: Promise<{ competitionCode: string }>;
}) {
  await requireViewer();
  const { competitionCode } = await params;

  const sb = await createClient();
  const { data: competition } = await sb
    .from("competitions")
    .select("name, is_active")
    .eq("code", competitionCode)
    .maybeSingle();
  // Compétition inconnue, ou décorative : rien à rejoindre derrière.
  if (!competition || !competition.is_active) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Link href="/ligues/rejoindre" className="w-fit text-[13px] font-semibold text-ink-muted">
          ← Catalogue
        </Link>
        <h1 className="font-display text-3xl tracking-tight text-ink">{competition.name}</h1>
        <p className="text-ink-muted">
          Demande la clé à l&apos;administrateur de la ligue que tu veux rejoindre.
        </p>
      </div>

      <JoinForm />
    </div>
  );
}
