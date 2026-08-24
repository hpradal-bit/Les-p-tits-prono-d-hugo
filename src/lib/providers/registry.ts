/**
 * La chaîne de fournisseurs et sa règle de bascule.
 *
 * ESPN en premier (gratuit, sans quota). En cas d'échec, API-Sports (100
 * requêtes par jour). Si les deux échouent, on ne casse rien : l'appelant
 * garde la dernière donnée connue en base et la panne est journalisée dans
 * `sync_runs`.
 */

import { APISPORTS, createApiSportsProvider } from "./apisports.ts";
import { ESPN, createEspnProvider } from "./espn.ts";
import { ProviderError, type ProviderResponse, type SportsDataProvider } from "./types.ts";

export interface ProviderChainEnv {
  /** Clé API-Sports. Absente = pas de secours, ESPN seul. */
  apisportsKey?: string;
  /** Quota journalier d'API-Sports, lu dans `app_settings`. */
  apisportsQuota?: number;
  /** Requêtes API-Sports déjà consommées aujourd'hui (somme de `sync_runs`). */
  apisportsUsedToday?: number;
}

export interface ProviderChain {
  providers: SportsDataProvider[];
  /** Fournisseurs écartés d'emblée, avec la raison (quota, clé absente…). */
  skipped: { provider: string; reason: string }[];
}

/**
 * Construit la chaîne dans l'ordre de préférence. Un fournisseur dont le quota
 * journalier est déjà épuisé n'entre pas dans la chaîne : mieux vaut la
 * dernière donnée connue qu'un 429 en pleine journée de championnat.
 */
export function createProviderChain(env: ProviderChainEnv = {}): ProviderChain {
  const providers: SportsDataProvider[] = [createEspnProvider()];
  const skipped: { provider: string; reason: string }[] = [];

  if (!env.apisportsKey) {
    skipped.push({ provider: APISPORTS, reason: "clé APISPORTS_KEY absente" });
    return { providers, skipped };
  }

  const quota = env.apisportsQuota ?? undefined;
  const used = env.apisportsUsedToday ?? 0;
  if (quota !== undefined && used >= quota) {
    skipped.push({
      provider: APISPORTS,
      reason: `quota journalier atteint (${used}/${quota} requêtes)`,
    });
    return { providers, skipped };
  }

  providers.push(
    createApiSportsProvider({ apiKey: env.apisportsKey, dailyQuota: quota }),
  );
  return { providers, skipped };
}

/** Les trois natures de synchronisation, qui n'ont pas les mêmes besoins. */
export type SyncKind = "calendar" | "live" | "standings";

/**
 * L'ordre de préférence par nature de synchronisation.
 *
 * Il n'y a pas de « meilleur fournisseur » dans l'absolu, et c'est la leçon de
 * la première synchronisation : le calendrier d'ESPN était irréprochable —
 * 182 matchs, les 14 clubs rapprochés — pendant que son classement renvoyait
 * le tableau final de la saison précédente.
 *
 * Le quota interdit par ailleurs de tout confier à API-Sports : 100 requêtes
 * par jour contre 288 réveils du planificateur les jours de match. Mettre le
 * direct chez lui l'épuiserait avant la mi-temps.
 *
 * D'où un ordre par nature, et non un ordre global. Ces valeurs vivent dans
 * `app_settings` (`sync.provider_order`) : les changer ne demande pas de
 * redéploiement.
 */
export const DEFAULT_PROVIDER_ORDER: Record<SyncKind, string[]> = {
  calendar: [ESPN, APISPORTS],
  live: [ESPN, APISPORTS],
  // Le classement avait été confié à API-Sports d'abord, ESPN renvoyant la
  // saison précédente. Mais l'offre gratuite d'API-Sports ne dessert que les
  // saisons 2022 à 2024 : « Free plans do not have access to this season ».
  // Le placer en tête gaspillait une requête à chaque passage pour un refus
  // certain. Il reste dans la chaîne — il ne coûte rien tant qu'on ne
  // l'appelle pas, et l'ordre se change en base le jour d'un abonnement.
  standings: [ESPN, APISPORTS],
};

/** L'ordre retenu pour une nature donnée, avec repli sur les valeurs ci-dessus. */
export function readProviderOrder(raw: unknown, kind: SyncKind): string[] {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const value = (raw as Record<string, unknown>)[kind];
    if (Array.isArray(value)) {
      const names = value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
      if (names.length > 0) return names.map((n) => n.trim().toLowerCase());
    }
  }
  return DEFAULT_PROVIDER_ORDER[kind];
}

/**
 * Réordonne la chaîne selon une préférence exprimée par nom.
 *
 * Un fournisseur absent de la préférence n'est pas écarté : il passe après les
 * autres, en gardant son rang relatif. Une préférence ne doit jamais faire
 * disparaître un secours — c'est le contraire de ce qu'on lui demande.
 */
export function orderChain(chain: ProviderChain, preferred: string[]): ProviderChain {
  if (preferred.length === 0) return chain;

  const rank = new Map(preferred.map((name, i) => [name.toLowerCase(), i]));
  const providers = [...chain.providers].sort(
    (a, b) =>
      (rank.get(a.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER),
  );

  return { ...chain, providers };
}

export interface AttemptLog {
  provider: string;
  ok: boolean;
  requestsUsed: number;
  error?: string;
  warnings?: string[];
}

export interface ChainOutcome<T> {
  /** null = tous les fournisseurs ont échoué : on garde la dernière donnée connue. */
  response: ProviderResponse<T> | null;
  attempts: AttemptLog[];
  /** Requêtes consommées par fournisseur, pour `sync_runs.requests_used`. */
  requestsByProvider: Record<string, number>;
}

/**
 * Essaie chaque fournisseur dans l'ordre et renvoie le premier qui répond.
 * Ne lève jamais : l'échec total est une valeur de retour, pas une exception —
 * une synchronisation ratée ne doit pas faire tomber l'application.
 */
export async function runWithFallback<T>(
  chain: ProviderChain,
  call: (provider: SportsDataProvider) => Promise<ProviderResponse<T>>,
): Promise<ChainOutcome<T>> {
  const attempts: AttemptLog[] = chain.skipped.map((s) => ({
    provider: s.provider,
    ok: false,
    requestsUsed: 0,
    error: s.reason,
  }));
  const requestsByProvider: Record<string, number> = {};

  for (const provider of chain.providers) {
    try {
      const response = await call(provider);
      requestsByProvider[provider.name] =
        (requestsByProvider[provider.name] ?? 0) + response.requestsUsed;
      attempts.push({
        provider: provider.name,
        ok: true,
        requestsUsed: response.requestsUsed,
        warnings: response.warnings,
      });
      return { response, attempts, requestsByProvider };
    } catch (error) {
      // Un appel qui échoue a pu consommer une requête : on la compte quand même.
      requestsByProvider[provider.name] = (requestsByProvider[provider.name] ?? 0) + 1;
      attempts.push({
        provider: provider.name,
        ok: false,
        requestsUsed: 1,
        error: describeError(error),
      });
    }
  }

  return { response: null, attempts, requestsByProvider };
}

export function describeError(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  if (error instanceof Error) return `${error.name}: ${error.message}`;

  // Supabase ne lève pas des `Error` mais des objets simples
  // (`{ code, message, details, hint }`). `String(error)` les réduisait à
  // « [object Object] » — un message qui coûte autant à lire qu'un silence,
  // et qui laisse l'administrateur sans rien à corriger.
  if (error !== null && typeof error === "object") {
    const fields = error as Record<string, unknown>;
    const parts = [fields.code, fields.message, fields.details, fields.hint]
      .filter((v) => typeof v === "string" || typeof v === "number")
      .map((v) => String(v).trim())
      .filter((v) => v !== "");
    if (parts.length > 0) return parts.join(" — ");

    try {
      // Un objet dont aucun champ n'est reconnu vaut encore mieux brut que
      // remplacé par « [object Object] ».
      return JSON.stringify(error);
    } catch {
      return "erreur non sérialisable";
    }
  }

  return String(error);
}

export { APISPORTS, ESPN };
