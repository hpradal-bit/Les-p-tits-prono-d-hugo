/**
 * Le contexte d'une synchronisation : la saison active, les réglages, les
 * équipes, la chaîne de fournisseurs.
 *
 * Tout ce qui se règle vient de `app_settings` ou du barème. Rien n'est décidé
 * ici : ce module ne fait que lire la base et assembler.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRuleset, loadSettings, setting, type Settings } from "@/lib/settings";
import { buildAliasIndex, type TeamAliases, type TeamCandidate } from "../normalize.ts";
import {
  createProviderChain, orderChain, readProviderOrder,
  type ProviderChain, type SyncKind,
} from "../registry.ts";
import { APISPORTS, APISPORTS_FREE_QUOTA } from "../apisports.ts";

export interface SyncSeason {
  id: string;
  label: string;
  competitionId: string;
  startsOn: string;
  endsOn: string | null;
}

export interface SyncContext {
  sb: SupabaseClient;
  season: SyncSeason;
  settings: Settings;
  teams: TeamCandidate[];
  aliases: TeamAliases;
  chain: ProviderChain;
  /** La chaîne réordonnée pour une nature de synchronisation donnée. */
  chainFor: (kind: SyncKind) => ProviderChain;
  /** Délai de verrouillage en vigueur, issu du barème (`lock`). */
  lockMinutes: number;
  /** Requêtes API-Sports déjà consommées aujourd'hui. */
  apisportsUsedToday: number;
}

/** La saison active, ou la plus récente si aucune n'est marquée active. */
export async function loadActiveSeason(
  sb: SupabaseClient,
  seasonId?: string,
): Promise<SyncSeason> {
  let query = sb
    .from("seasons")
    .select("id, label, competition_id, starts_on, ends_on, status")
    .order("starts_on", { ascending: false })
    .limit(1);

  query = seasonId ? query.eq("id", seasonId) : query.eq("status", "active");

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      seasonId
        ? `Saison ${seasonId} introuvable.`
        : "Aucune saison active : à définir dans l'espace admin.",
    );
  }

  return {
    id: data.id,
    label: data.label,
    competitionId: data.competition_id,
    startsOn: data.starts_on,
    endsOn: data.ends_on,
  };
}

/** Les équipes engagées dans la saison — le référentiel du rapprochement. */
export async function loadSeasonTeams(
  sb: SupabaseClient,
  seasonId: string,
): Promise<TeamCandidate[]> {
  const { data, error } = await sb
    .from("season_teams")
    .select("teams(id, code, name, short_name, city)")
    .eq("season_id", seasonId);
  if (error) throw error;

  type Row = { teams: { id: string; code: string; name: string; short_name: string; city: string | null } | null };
  return ((data ?? []) as unknown as Row[])
    .map((row) => row.teams)
    .filter((t): t is NonNullable<Row["teams"]> => t !== null)
    .map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      shortName: t.short_name,
      city: t.city,
    }));
}

/**
 * Requêtes API-Sports consommées depuis 00:00 UTC — l'heure de remise à zéro
 * du quota gratuit. C'est ce chiffre qui décide si le secours reste utilisable.
 *
 * On n'additionne que les lignes du grand livre (`detail.ledger`) : les lignes
 * récapitulatives comptent les mêmes requêtes, les inclure les compterait deux
 * fois et amputerait le quota de moitié.
 */
export async function countApiSportsRequestsToday(sb: SupabaseClient): Promise<number> {
  const midnightUtc = new Date();
  midnightUtc.setUTCHours(0, 0, 0, 0);

  const { data, error } = await sb
    .from("sync_runs")
    .select("requests_used")
    .eq("provider", APISPORTS)
    .contains("detail", { ledger: true })
    .gte("started_at", midnightUtc.toISOString());
  if (error) throw error;

  return (data ?? []).reduce((total, row) => total + (row.requests_used ?? 0), 0);
}

export async function createSyncContext(
  sb: SupabaseClient,
  options: { seasonId?: string } = {},
): Promise<SyncContext> {
  const season = await loadActiveSeason(sb, options.seasonId);
  const [settings, teams, apisportsUsedToday] = await Promise.all([
    loadSettings(sb),
    loadSeasonTeams(sb, season.id),
    countApiSportsRequestsToday(sb),
  ]);

  // Le délai de verrouillage fait partie du barème ; `app_settings` sert de
  // repli si aucun barème n'est encore publié pour la saison.
  let lockMinutes = setting(settings, "lock.minutes_before_kickoff", 120);
  try {
    const ruleset = await loadRuleset(sb, season.id);
    lockMinutes = ruleset.lock.minutesBeforeKickoff;
  } catch {
    // Pas de barème : on garde la valeur d'app_settings.
  }

  const apisportsQuota = setting(settings, "sync.apisports_daily_quota", APISPORTS_FREE_QUOTA);
  const chain = createProviderChain({
    apisportsKey: process.env.APISPORTS_KEY,
    apisportsQuota,
    apisportsUsedToday,
  });

  // L'ordre de préférence dépend de la nature de la synchronisation : le
  // calendrier et le classement n'ont ni les mêmes forces ni les mêmes quotas.
  const orderSetting = setting<unknown>(settings, "sync.provider_order", null);

  return {
    sb,
    season,
    chainFor: (kind: SyncKind) => orderChain(chain, readProviderOrder(orderSetting, kind)),
    settings,
    teams,
    aliases: buildAliasIndex(settings["sync.team_aliases"]),
    chain,
    lockMinutes,
    apisportsUsedToday,
  };
}
