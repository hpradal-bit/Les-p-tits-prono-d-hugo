import type { Metadata } from "next";
import { Card, Label } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings, setting } from "@/lib/settings";
import { SyncButtons, type SeasonChoice } from "./_components/sync-buttons";

export const metadata: Metadata = { title: "Synchronisation — Admin" };
export const dynamic = "force-dynamic";

/**
 * L'écran qui répond à « d'où viennent les scores, et est-ce que ça marche ? ».
 *
 * Il existe pour une raison précise : sans lui, la seule façon de déclencher
 * une synchronisation était d'appeler une route HTTP avec un secret partagé.
 * Le jour où le planificateur tombe — un samedi soir de préférence — cette
 * manipulation n'est pas tenable. L'alternative serait de saisir les scores à
 * la main, ce que ce projet refuse.
 */

const KIND_LABELS: Record<string, string> = {
  calendar: "Calendrier",
  live: "Scores",
  standings: "Classement",
};

const STATUS_LABELS: Record<string, string> = {
  success: "✅",
  partial: "⚠️",
  failed: "⛔️",
  skipped: "⏭️",
};

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

export default async function SynchronisationPage() {
  const admin = createAdminClient();

  const [settings, runsResult, refsResult, fixturesResult, seasonsResult] = await Promise.all([
    loadSettings(admin),
    admin
      .from("sync_runs")
      .select("kind, provider, status, started_at, requests_used, fixtures_updated, error")
      .order("started_at", { ascending: false })
      .limit(8),
    admin.from("external_refs").select("provider, entity_type"),
    admin.from("fixtures").select("id, kickoff_confirmed", { count: "exact" }),
    admin
      .from("seasons")
      .select("id, label, status, competitions:competition_id (name)")
      .order("starts_on", { ascending: false }),
  ]);

  const runs = runsResult.data ?? [];
  const refs = refsResult.data ?? [];
  const fixtures = fixturesResult.data ?? [];

  const seasons: SeasonChoice[] = (seasonsResult.data ?? []).map((s) => {
    const competition = (Array.isArray(s.competitions) ? s.competitions[0] : s.competitions) as
      | { name?: string }
      | null;
    return {
      id: s.id as string,
      label: s.label as string,
      competition: competition?.name ?? "Compétition",
      isActive: s.status === "active",
    };
  });

  const aliases = setting<Record<string, string>>(settings, "sync.team_aliases", {});
  const aliasCount = Object.keys(aliases).length;
  const hasApiSports = Boolean(process.env.APISPORTS_KEY);
  const hasSyncSecret = Boolean(process.env.SYNC_SECRET);

  const competitionRef = refs.find((r) => r.entity_type === "competition");
  const teamRefs = refs.filter((r) => r.entity_type === "team").length;
  const confirmed = fixtures.filter((f) => f.kickoff_confirmed).length;

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-col gap-0.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          Administration
        </span>
        <h1 className="font-display text-[26px] leading-none text-ink">Synchronisation</h1>
      </header>

      <Card className="flex flex-col gap-2 p-4">
        <Label>État</Label>
        <p
          className={`rounded-lg px-3 py-2 text-[13.5px] ${
            runs.length === 0 ? "bg-surface-sunk text-ink-muted" : "bg-winner-soft text-winner"
          }`}
        >
          {runs.length === 0
            ? "Aucune synchronisation n'a jamais tourné. Lance le calendrier pour voir si le fournisseur répond."
            : `Dernière synchronisation ${ago(runs[0].started_at as string)}, via ${runs[0].provider}.`}
        </p>
        <ul className="flex flex-col gap-1 text-[13px] text-ink-muted">
          <li>
            {competitionRef ? "✅" : "⬜️"} Compétition rattachée à{" "}
            <span className="font-mono text-[12px]">{competitionRef?.provider ?? "aucun fournisseur"}</span>.
          </li>
          <li>
            {hasApiSports ? "✅" : "⬜️"} Secours API-Sports —{" "}
            {hasApiSports
              ? "clé présente. Attention : l'offre gratuite ne dessert que les saisons 2022 à 2024, elle ne peut donc pas relayer ESPN sur la saison en cours."
              : "pas de clé APISPORTS_KEY."}{" "}
            En pratique, ESPN est aujourd'hui le seul fournisseur de cette saison — les
            boutons ci-dessous restent le filet s'il tombe.
          </li>
          <li>
            {aliasCount > 0 ? "✅" : "⬜️"} {aliasCount} alias d&apos;équipe posé
            {aliasCount > 1 ? "s" : ""} — ils rattrapent les graphies inhabituelles.
          </li>
          <li>
            {teamRefs > 0 ? "✅" : "⬜️"} {teamRefs} équipe{teamRefs > 1 ? "s" : ""} déjà rapprochée
            {teamRefs > 1 ? "s" : ""} — écrites au premier passage, plus jamais devinées ensuite.
          </li>
          <li>
            {confirmed > 0 ? "✅" : "⬜️"} {confirmed} horaire{confirmed > 1 ? "s" : ""} confirmé
            {confirmed > 1 ? "s" : ""} sur {fixtures.length} match{fixtures.length > 1 ? "s" : ""} —
            seul un horaire confirmé fixe l&apos;heure de verrouillage.
          </li>
          <li>
            {hasSyncSecret ? "✅" : "⬜️"} Secret{" "}
            <span className="font-mono text-[12px]">SYNC_SECRET</span>{" "}
            {hasSyncSecret
              ? "présent — le planificateur Cloudflare peut appeler l'application."
              : "absent — les boutons ci-dessous fonctionnent quand même, mais le planificateur automatique, non."}
          </li>
        </ul>
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <Label>Lancer une synchronisation</Label>
          <p className="text-[13px] leading-relaxed text-ink-faint">
            Le même code que le planificateur, déclenché à la main. Aucun score n&apos;est jamais
            écrit par un joueur : ces boutons interrogent le fournisseur, rapprochent les équipes,
            puis relancent le calcul des points.
          </p>
        </div>
        <SyncButtons seasons={seasons} />
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <Label>Les derniers passages</Label>
          <p className="text-[13px] leading-relaxed text-ink-faint">
            Chaque tentative est journalisée, y compris celles qui échouent — c&apos;est là qu&apos;on
            lit ce qu&apos;un fournisseur a refusé de donner.
          </p>
        </div>

        {runs.length === 0 ? (
          <p className="rounded-lg bg-surface-sunk px-3 py-2.5 text-[13px] text-ink-muted">
            Rien pour l&apos;instant.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {runs.map((r, i) => (
              <li
                key={`${r.started_at}-${i}`}
                className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b border-line pb-1.5 text-[13px] last:border-none"
              >
                <span aria-hidden>{STATUS_LABELS[r.status as string] ?? "•"}</span>
                <span className="font-semibold text-ink">
                  {KIND_LABELS[r.kind as string] ?? r.kind}
                </span>
                <span className="font-mono text-[11.5px] text-ink-faint">{r.provider}</span>
                <span className="text-ink-muted">{ago(r.started_at as string)}</span>
                <span className="tabular font-mono text-[11.5px] text-ink-faint">
                  {r.fixtures_updated ?? 0} maj · {r.requests_used ?? 0} req
                </span>
                {r.error && (
                  <span className="w-full font-mono text-[11.5px] leading-snug text-wrong">
                    {r.error}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
