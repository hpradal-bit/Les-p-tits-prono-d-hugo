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

/** Le barème en vigueur pour une saison aujourd'hui, tranches d'écart comprises. */
export async function loadRuleset(sb: SupabaseClient, seasonId: Uuid): Promise<Ruleset> {
  return loadRulesetAt(sb, seasonId, new Date());
}

/** Une version de barème, réduite à sa période de validité. */
export interface RulesetPeriod {
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/**
 * La version qui s'appliquait à une date donnée.
 *
 * Fonction pure, et c'est le point : c'est elle qui garantit qu'un match noté
 * en septembre reste noté avec le barème de septembre, même si on rejoue la
 * saison en février. Une version est en vigueur de `effectiveFrom` inclus à
 * `effectiveTo` exclu ; `effectiveTo` à `null` veut dire « toujours en cours ».
 *
 * Si aucune version ne couvre la date — un match antérieur à la création du
 * barème — on retombe sur la plus ancienne : mieux vaut un barème que rien.
 */
export function pickVersionAt<T extends RulesetPeriod>(versions: T[], at: Date): T | null {
  if (versions.length === 0) return null;
  const iso = at.toISOString();

  const inForce = versions
    .filter((v) => v.effectiveFrom <= iso && (v.effectiveTo === null || v.effectiveTo > iso))
    .sort((a, b) => b.version - a.version);
  if (inForce.length > 0) return inForce[0];

  return versions.reduce((oldest, v) => (v.version < oldest.version ? v : oldest));
}

/**
 * Le barème en vigueur à une date donnée, tranches d'écart comprises.
 *
 * Un barème peut être remplacé en cours de saison sans rien réécrire : la
 * version en cours est close, une nouvelle s'ouvre. Chaque match est alors
 * noté avec le barème qui s'appliquait au moment où ses pronostics ont été
 * verrouillés — c'est celui sous lequel les joueurs ont joué.
 */
export async function loadRulesetAt(
  sb: SupabaseClient,
  seasonId: Uuid,
  at: Date,
): Promise<Ruleset> {
  const { data: versions, error } = await sb
    .from("scoring_rulesets")
    .select("id, version, rules, effective_from, effective_to")
    .eq("season_id", seasonId)
    .order("version", { ascending: false });
  if (error) throw error;

  const rs = pickVersionAt(
    (versions ?? []).map((v) => ({
      id: v.id as Uuid,
      version: v.version as number,
      rules: v.rules,
      effectiveFrom: v.effective_from as string,
      effectiveTo: (v.effective_to as string | null) ?? null,
    })),
    at,
  );
  if (!rs) throw new Error(`Aucun barème pour la saison ${seasonId}.`);

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
