/**
 * `external_refs` : la table qui rend l'application indépendante des API.
 *
 * Nos identifiants ne sortent jamais, ceux des fournisseurs n'entrent jamais.
 * Entre les deux, une ligne par (fournisseur, type d'entité, identifiant).
 *
 * Le rapprochement par nom normalisé n'a lieu **qu'une fois**, au premier
 * import : dès qu'une correspondance est écrite ici, on la lit au lieu de la
 * deviner.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { matchTeam, type TeamAliases, type TeamCandidate } from "./normalize.ts";
import type { ProviderTeam } from "./types.ts";

export type EntityType = "team" | "fixture" | "competition" | "season";

export interface ExternalRefRow {
  provider: string;
  entity_type: EntityType;
  entity_id: string;
  external_id: string;
  payload?: Record<string, unknown> | null;
}

/** Toutes les correspondances connues d'un fournisseur pour un type d'entité. */
export async function loadRefs(
  sb: SupabaseClient,
  provider: string,
  entityType: EntityType,
): Promise<{ byExternalId: Map<string, string>; byEntityId: Map<string, string> }> {
  const { data, error } = await sb
    .from("external_refs")
    .select("entity_id, external_id")
    .eq("provider", provider)
    .eq("entity_type", entityType);
  if (error) throw error;

  const byExternalId = new Map<string, string>();
  const byEntityId = new Map<string, string>();
  for (const row of data ?? []) {
    byExternalId.set(String(row.external_id), String(row.entity_id));
    byEntityId.set(String(row.entity_id), String(row.external_id));
  }
  return { byExternalId, byEntityId };
}

/**
 * L'identifiant d'une saison chez un fournisseur (`270559` chez ESPN,
 * `16:2026` chez API-Sports). C'est la seule porte d'entrée : si la ligne
 * n'existe pas, on n'invente pas d'identifiant, on le dit.
 */
export async function loadSeasonExternalId(
  sb: SupabaseClient,
  provider: string,
  seasonId: string,
  competitionId: string,
): Promise<string | null> {
  const { data, error } = await sb
    .from("external_refs")
    .select("entity_type, external_id")
    .eq("provider", provider)
    .in("entity_type", ["season", "competition"])
    .in("entity_id", [seasonId, competitionId]);
  if (error) throw error;

  // Une référence de saison est plus précise qu'une référence de compétition.
  const season = (data ?? []).find((r) => r.entity_type === "season");
  const competition = (data ?? []).find((r) => r.entity_type === "competition");
  return (season ?? competition)?.external_id ?? null;
}

/** Écrit (ou confirme) une correspondance. Idempotent. */
export async function upsertRef(sb: SupabaseClient, row: ExternalRefRow): Promise<void> {
  const { error } = await sb
    .from("external_refs")
    .upsert(
      {
        provider: row.provider,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        external_id: row.external_id,
        payload: row.payload ?? null,
      },
      { onConflict: "provider,entity_type,external_id" },
    );
  if (error) throw error;
}

export interface TeamResolution {
  /** Notre identifiant d'équipe, ou null si le rapprochement a échoué. */
  teamId: string | null;
  /** Vrai si la correspondance vient d'être créée par rapprochement de nom. */
  created: boolean;
  /** Explication, journalisée dans `sync_runs.detail` en cas d'échec. */
  note: string;
}

/**
 * Le résolveur d'équipes d'une synchronisation : il lit `external_refs`, ne
 * rapproche par nom que ce qu'il ne connaît pas encore, et mémorise ce qu'il a
 * conclu pour ne plus jamais avoir à deviner.
 */
export class TeamResolver {
  private readonly pendingRefs: ExternalRefRow[] = [];
  private readonly provider: string;
  private readonly teams: TeamCandidate[];
  private readonly refsByExternalId: Map<string, string>;
  private readonly aliases: TeamAliases;

  constructor(
    provider: string,
    teams: TeamCandidate[],
    refsByExternalId: Map<string, string>,
    aliases: TeamAliases,
  ) {
    this.provider = provider;
    this.teams = teams;
    this.refsByExternalId = refsByExternalId;
    this.aliases = aliases;
  }

  static async create(
    sb: SupabaseClient,
    provider: string,
    teams: TeamCandidate[],
    aliases: TeamAliases,
  ): Promise<TeamResolver> {
    const { byExternalId } = await loadRefs(sb, provider, "team");
    return new TeamResolver(provider, teams, byExternalId, aliases);
  }

  resolve(team: ProviderTeam): TeamResolution {
    if (team.externalId) {
      const known = this.refsByExternalId.get(team.externalId);
      if (known) return { teamId: known, created: false, note: "correspondance connue" };
    }

    const match = matchTeam([team.name, ...team.aliases], this.teams, this.aliases);
    if (!match) {
      return {
        teamId: null,
        created: false,
        note: `équipe « ${team.name} » non rapprochée — ajouter un alias dans app_settings.sync.team_aliases`,
      };
    }

    if (team.externalId) {
      this.refsByExternalId.set(team.externalId, match.team.id);
      this.pendingRefs.push({
        provider: this.provider,
        entity_type: "team",
        entity_id: match.team.id,
        external_id: team.externalId,
        payload: { matched_name: team.name, reason: match.reason, score: match.score },
      });
    }

    return {
      teamId: match.team.id,
      created: true,
      note: `« ${team.name} » → ${match.team.code} (${match.reason}, ${match.score.toFixed(2)})`,
    };
  }

  /** Écrit en une fois les correspondances découvertes pendant la synchro. */
  async flush(sb: SupabaseClient): Promise<number> {
    if (this.pendingRefs.length === 0) return 0;
    const rows = this.pendingRefs.splice(0, this.pendingRefs.length);

    // `external_refs` impose l'unicité dans les deux sens : une entité n'a
    // qu'un identifiant par fournisseur. Si le fournisseur a changé le sien,
    // l'ancienne ligne doit disparaître avant qu'on écrive la nouvelle.
    const { error: cleanupError } = await sb
      .from("external_refs")
      .delete()
      .eq("provider", this.provider)
      .eq("entity_type", "team")
      .in(
        "entity_id",
        rows.map((r) => r.entity_id),
      )
      .not("external_id", "in", `(${rows.map((r) => `"${r.external_id}"`).join(",")})`);
    if (cleanupError) throw cleanupError;

    const { error } = await sb
      .from("external_refs")
      .upsert(rows, { onConflict: "provider,entity_type,external_id" });
    if (error) throw error;
    return rows.length;
  }
}
