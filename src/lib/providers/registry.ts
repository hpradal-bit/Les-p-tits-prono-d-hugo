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
  return String(error);
}

export { APISPORTS, ESPN };
