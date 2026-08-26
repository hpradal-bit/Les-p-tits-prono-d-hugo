/**
 * Écran de classement des joueurs.
 *
 * Trois vues (journée · général · forme) et deux portées (live · officiel),
 * toutes servies par le même moteur : `src/lib/standings/engine`. L'état vit
 * dans l'URL, l'écran reste un composant serveur.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Card, CompetitionLogo, Label } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { resolveLeagueId } from "@/lib/leagues/queries.ts";
import {
  DEFAULT_FORM_WINDOW,
  computeStandings,
  playedRounds,
  type StandingsKind,
  type StandingsScope,
} from "@/lib/standings/engine";
import {
  loadActiveSeason,
  loadRoundFixtures,
  loadStandingsData,
  loadStandingsHistory,
  type RoundFixture,
} from "@/lib/standings/queries";
import { Podium } from "./_components/podium";
import { StandingsList } from "./_components/standings-list";
import { StandingsGraph } from "./_components/standings-graph";
import { RoundFixtures } from "./_components/round-fixtures";
import { Segmented, RoundPicker } from "./_components/controls";

export const metadata = { title: "Classement" };

/** Toute entrée est validée côté serveur, y compris les paramètres d'URL. */
const QuerySchema = z.object({
  vue: z.enum(["general", "journee", "forme"]).catch("general"),
  portee: z.enum(["live", "officiel"]).catch("live"),
  journee: z.coerce.number().int().min(1).max(99).nullable().catch(null),
});

type View = z.infer<typeof QuerySchema>["vue"];
type Reach = z.infer<typeof QuerySchema>["portee"];

const KIND_OF: Record<View, StandingsKind> = {
  general: "overall",
  journee: "round",
  forme: "form",
};

const SCOPE_OF: Record<Reach, StandingsScope> = {
  live: "live",
  officiel: "official",
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function buildHref(params: {
  vue: View;
  portee: Reach;
  journee?: number | null;
  league: string;
}): string {
  const search = new URLSearchParams();
  if (params.vue !== "general") search.set("vue", params.vue);
  if (params.portee !== "live") search.set("portee", params.portee);
  if (params.vue === "journee" && params.journee) {
    search.set("journee", String(params.journee));
  }
  search.set("league", params.league);
  return `/classement?${search.toString()}`;
}

export default async function ClassementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = QuerySchema.parse({
    vue: firstValue(raw.vue),
    portee: firstValue(raw.portee),
    journee: firstValue(raw.journee),
  });

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/connexion");

  const resolved = await resolveLeagueId(sb, user.id, firstValue(raw.league));
  if (!resolved) redirect("/accueil");
  const { leagueId, leagues: myLeagues } = resolved;

  const season = await loadActiveSeason(sb, leagueId);
  if (!season) {
    return (
      <PageShell title="Classement" subtitle="Aucune saison active">
        <Card className="p-5 text-sm text-ink-muted">
          Aucune saison n&apos;est ouverte pour le moment. Le classement apparaîtra dès que
          l&apos;administrateur aura activé la saison.
        </Card>
      </PageShell>
    );
  }

  const [data, history] = await Promise.all([
    loadStandingsData(sb, season, leagueId),
    loadStandingsHistory(sb, season.id),
  ]);
  const scope = SCOPE_OF[query.portee];
  const kind = KIND_OF[query.vue];
  const played = playedRounds(data.rounds, data.entries, scope);

  // Journée demandée : celle de l'URL si elle a été jouée, sinon la dernière.
  const askedRound =
    query.vue === "journee" && query.journee
      ? (played.find((r) => {
          const detail = data.roundsDetail.find((d) => d.id === r.id);
          return detail?.number === query.journee;
        })?.id ?? null)
      : null;

  const table = computeStandings(data, {
    kind,
    scope,
    roundId: askedRound,
  });

  const referenceIndex = played.findIndex((r) => r.id === table.referenceRoundId);
  const referenceRound = referenceIndex >= 0 ? played[referenceIndex] : null;
  const countedRounds = data.rounds.filter((r) => table.roundIds.includes(r.id));

  const viewOptions = (["journee", "general", "forme"] as View[]).map((value) => ({
    value,
    label: value === "journee" ? "Journée" : value === "general" ? "Général" : "Forme",
    href: buildHref({
      vue: value,
      portee: query.portee,
      journee: value === "journee" ? (referenceRound ? roundNumber(data, referenceRound.id) : null) : null,
      league: leagueId,
    }),
  }));

  const reachOptions = (["live", "officiel"] as Reach[]).map((value) => ({
    value,
    label: value === "live" ? "Live" : "Officiel",
    href: buildHref({ vue: query.vue, portee: value, journee: query.journee, league: leagueId }),
  }));

  const ligueOptions = myLeagues.map((l) => ({
    value: l.leagueId,
    label: l.leagueName,
    href: buildHref({ vue: query.vue, portee: query.portee, journee: null, league: l.leagueId }),
  }));

  // Les matchs de la journée affichée : la porte d'entrée du Match Center.
  let fixtures: RoundFixture[] = [];
  if (query.vue === "journee" && referenceRound) {
    fixtures = await loadRoundFixtures(sb, referenceRound.id);
  }

  return (
    <PageShell
      title="Le classement"
      subtitle={
        referenceRound
          ? `Après la ${referenceRound.name.toLowerCase()}`
          : `${season.competitionName} · ${season.label}`
      }
      logo={<CompetitionLogo name={season.competitionName} logoUrl={season.competitionLogoUrl} size={30} />}
      banner={table.referenceRoundId !== null ? <Podium rows={table.rows} /> : undefined}
    >
      <div className="flex flex-col gap-3">
        {ligueOptions.length > 1 && (
          <Segmented options={ligueOptions} current={leagueId} label="Ligue" />
        )}
        <Segmented options={viewOptions} current={query.vue} label="Type de classement" />
        <Segmented options={reachOptions} current={query.portee} label="Portée du classement" />
        <p className="font-mono text-[11px] leading-relaxed text-ink-faint">
          {query.portee === "live"
            ? "Live : tous les matchs joués comptent, y compris ceux en cours."
            : "Officiel : seuls les résultats définitifs comptent."}
        </p>
      </div>

      {query.vue === "journee" && referenceRound && (
        <RoundPicker
          name={referenceRound.name}
          previousHref={
            referenceIndex > 0
              ? buildHref({
                  vue: "journee",
                  portee: query.portee,
                  journee: roundNumber(data, played[referenceIndex - 1].id),
                  league: leagueId,
                })
              : null
          }
          nextHref={
            referenceIndex >= 0 && referenceIndex < played.length - 1
              ? buildHref({
                  vue: "journee",
                  portee: query.portee,
                  journee: roundNumber(data, played[referenceIndex + 1].id),
                  league: leagueId,
                })
              : null
          }
        />
      )}

      {/* Le classement reste visible même sans le moindre résultat : une ligue
          qui vient de se créer doit voir ses membres, à 0 point, plutôt qu'un
          écran vide qui laisserait croire à une panne. */}
      <StandingsList rows={table.rows} viewerId={user?.id ?? null} />
      {table.referenceRoundId === null ? (
        <Card className="p-5 text-sm leading-relaxed text-ink-muted">
          {query.portee === "officiel"
            ? "Aucun résultat n'est encore officiel. Le classement officiel s'affinera dès la validation des premiers matchs."
            : "Le classement s'affinera dès les premiers résultats de la saison."}
        </Card>
      ) : (
        <p className="font-mono text-[11px] leading-relaxed text-ink-faint">
          {query.vue === "general" && countedRounds.length > 0 &&
            `Cumul de ${countedRounds[0].name} à ${countedRounds[countedRounds.length - 1].name}.`}
          {query.vue === "forme" && countedRounds.length > 0 &&
            `Les ${DEFAULT_FORM_WINDOW} dernières journées : ${countedRounds[0].name} → ${countedRounds[countedRounds.length - 1].name}.`}
          {query.vue === "journee" && referenceRound && `Points marqués sur la ${referenceRound.name}.`}
          {" L'évolution se lit par rapport à la journée précédente."}
        </p>
      )}

      {query.vue === "general" && history.roundLabels.length >= 2 && (
        <StandingsGraph
          players={history.players.map((p) => ({
            userId: p.userId,
            firstName: p.firstName,
            color: "",
            positions: p.positions,
          }))}
          roundLabels={history.roundLabels}
          viewerId={user?.id ?? null}
        />
      )}

      {fixtures.length > 0 && (
        <section className="flex flex-col gap-2">
          <Label>Les matchs de la journée</Label>
          <RoundFixtures fixtures={fixtures} />
        </section>
      )}

      <Link
        href={`/classement/reel?league=${leagueId}`}
        className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3 text-sm font-semibold text-clay shadow-[var(--shadow-card)] transition hover:bg-surface-sunk"
      >
        Voir le classement réel de {season.competitionName} →
      </Link>
    </PageShell>
  );
}

function roundNumber(
  data: { rounds: Array<{ id: string; number: number }> },
  roundId: string,
): number | null {
  return data.rounds.find((r) => r.id === roundId)?.number ?? null;
}

function PageShell({
  title,
  subtitle,
  logo,
  banner,
  children,
}: {
  title: string;
  subtitle: string;
  /** Le logo de la compétition affichée, à côté du titre. */
  logo?: React.ReactNode;
  /** Le podium vit dans le bandeau, comme sur la maquette. */
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="-mx-4 flex flex-col">
      <header className="flex flex-col gap-2.5 bg-sage px-6 pb-4 pt-3 text-surface">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-surface/70">
            {subtitle}
          </span>
          <div className="flex items-center gap-2.5">
            {logo}
            <h1 className="font-display text-[30px] leading-none">{title}</h1>
          </div>
        </div>
        {banner}
      </header>
      <div className="flex flex-col gap-3.5 px-4 pt-4">{children}</div>
    </div>
  );
}
