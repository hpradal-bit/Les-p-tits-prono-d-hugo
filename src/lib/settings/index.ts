import type { MarginBucket, Ruleset, Uuid } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lecture des réglages et du barème. Aucune valeur métier n'est codée en dur
 * ailleurs que dans les valeurs de repli ci-dessous, qui ne servent qu'au cas
 * où la base serait injoignable.
 */

export type Settings = Record<string, unknown>;

/** Le JSON tel qu'il est stocké dans scoring_rulesets.rules (clés en snake_case). */
interface RawRules {
  points: Ruleset["points"];
  margin_mode?: Ruleset["marginMode"];
  margin_distance_tolerance?: number;
  exact_score?: {
    quota?: number | null;
    period?: Ruleset["exactScore"]["period"];
    imposed_fixture_ids?: Uuid[];
  };
  lock?: { minutes_before_kickoff?: number };
  default_prediction?: {
    enabled?: boolean;
    outcome?: Ruleset["defaultPrediction"]["outcome"];
    margin_bucket?: string;
  };
}

export async function loadSettings(sb: SupabaseClient): Promise<Settings> {
  const { data, error } = await sb.from("app_settings").select("key, value");
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}

export function setting<T>(settings: Settings, key: string, fallback: T): T {
  const v = settings[key];
  return (v === undefined || v === null ? fallback : v) as T;
}

/** Le barème en vigueur pour une saison, tranches d'écart comprises. */
export async function loadRuleset(sb: SupabaseClient, seasonId: Uuid): Promise<Ruleset> {
  const { data: rs, error } = await sb
    .from("scoring_rulesets")
    .select("id, version, rules")
    .eq("season_id", seasonId)
    .lte("effective_from", new Date().toISOString())
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;

  const { data: rows, error: bErr } = await sb
    .from("margin_buckets")
    .select("id, position, min_points, max_points, label")
    .eq("ruleset_id", rs.id)
    .order("position");
  if (bErr) throw bErr;

  const buckets: MarginBucket[] = (rows ?? []).map((b) => ({
    id: b.id,
    position: b.position,
    minPoints: b.min_points,
    maxPoints: b.max_points,
    label: b.label,
  }));

  const r = rs.rules as RawRules;
  return {
    id: rs.id,
    version: rs.version,
    points: r.points,
    marginMode: r.margin_mode ?? "buckets",
    marginDistanceTolerance: r.margin_distance_tolerance ?? 3,
    exactScore: {
      quota: r.exact_score?.quota ?? 1,
      period: r.exact_score?.period ?? "round",
      imposedFixtureIds: r.exact_score?.imposed_fixture_ids ?? [],
    },
    lock: { minutesBeforeKickoff: r.lock?.minutes_before_kickoff ?? 120 },
    defaultPrediction: {
      enabled: r.default_prediction?.enabled ?? true,
      outcome: r.default_prediction?.outcome ?? "home",
      marginBucket: r.default_prediction?.margin_bucket ?? "median",
    },
    buckets,
  };
}
