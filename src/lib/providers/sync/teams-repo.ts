import type { SupabaseClient } from "@supabase/supabase-js";
import { planTeamSeeds } from "../bootstrap-teams.ts";
import type { ProviderFixture } from "../types.ts";
import type { TeamCandidate } from "../normalize.ts";

/**
 * Crée l'effectif d'une saison vide à partir de ce que renvoie le fournisseur.
 *
 * N'est appelé que lorsque la saison ne compte **aucune** équipe : c'est ce qui
 * rend l'opération sûre. Une saison vide ne peut pas produire de doublon, et
 * dès la première équipe enregistrée le rapprochement habituel reprend la main.
 */
export async function bootstrapSeasonTeams(
  sb: SupabaseClient,
  seasonId: string,
  competitionId: string,
  provider: string,
  fixtures: ProviderFixture[],
): Promise<{ created: number; names: string[]; teams: TeamCandidate[] }> {
  // Le sport porte l'unicité des codes : deux clubs de rugby ne peuvent pas
  // partager « SR », mais un club de football le pourrait.
  const { data: competition, error: cErr } = await sb
    .from("competitions")
    .select("sport_id")
    .eq("id", competitionId)
    .single();
  if (cErr) throw cErr;

  const sportId = competition.sport_id as string;

  const { data: existing, error: tErr } = await sb
    .from("teams")
    .select("code")
    .eq("sport_id", sportId);
  if (tErr) throw tErr;

  const seeds = planTeamSeeds(
    fixtures.flatMap((f) => [f.homeTeam, f.awayTeam]),
    (existing ?? []).map((t) => t.code as string),
  );
  if (seeds.length === 0) return { created: 0, names: [], teams: [] };

  const { data: inserted, error: iErr } = await sb
    .from("teams")
    .insert(seeds.map((s) => ({
      sport_id: sportId,
      name: s.name,
      short_name: s.shortName,
      code: s.code,
    })))
    .select("id, name, short_name, code");
  if (iErr) throw iErr;

  const rows = (inserted ?? []) as {
    id: string; name: string; short_name: string; code: string;
  }[];

  // Rattacher à la saison : sans cela, les équipes existent mais la
  // compétition reste vide.
  const { error: stErr } = await sb
    .from("season_teams")
    .insert(rows.map((t) => ({ season_id: seasonId, team_id: t.id })));
  if (stErr) throw stErr;

  // Les correspondances du fournisseur, pour que le prochain passage n'ait
  // plus rien à deviner.
  const byName = new Map(rows.map((t) => [t.name, t.id]));
  const refs = seeds
    .filter((s) => s.externalId && byName.has(s.name))
    .map((s) => ({
      provider,
      entity_type: "team",
      entity_id: byName.get(s.name) as string,
      external_id: s.externalId as string,
      payload: { bootstrapped: true },
    }));
  if (refs.length > 0) {
    const { error: rErr } = await sb.from("external_refs").insert(refs);
    if (rErr) throw rErr;
  }

  // Les équipes sont renvoyées telles quelles : les relire imposerait une
  // jointure, alors qu'on vient de les écrire et qu'on les a en main.
  return {
    created: rows.length,
    names: rows.map((t) => t.name),
    teams: rows.map((t) => ({
      id: t.id, code: t.code, name: t.name, shortName: t.short_name, city: null,
    })),
  };
}
