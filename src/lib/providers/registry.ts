/**
 * La chaîne de fournisseurs et sa règle de bascule.
 *
 * TheSportsDB en premier (gratuit, 30 req/min). En cas d'échec, Highlightly
 * (100 req/jour). Puis ESPN (gratuit, sans quota, mais API non documentée).
 * Enfin API-Sports (100 req/jour, ne couvre que 2022-2024 en gratuit).
 *
 * Si tous échouent, on ne casse rien : l'appelant garde la dernière donnée
 * connue en base et la panne est journalisée dans `sync_runs`.
 */

import { APISPORTS, createApiSportsProvider } from "./apisports.ts";
import { ESPN, createEspnProvider } from "./espn.ts";
import { HIGHLIGHTLY, createHighlightlyProvider } from "./highlightly.ts";
import { THESPORTSDB, createTheSportsDbProvider } from "./thesportsdb.ts";
import { ProviderError, type ProviderResponse, type SportsDataProvider } from "./types.ts";

export interface ProviderChainEnv {
  /** Clé TheSportsDB. Absente = on saute, Highlightly prend la main. */
  thesportsdbKey?: string;
  /** Clé RapidAPI pour Highlightly. Absente = on saute. */
  highlightlyKey?: string;
  /** Quota journalier de Highlightly, lu dans `app_settings`. */
  highlightlyQuota?: number;
  /** Requêtes Highlightly déjà consommées aujourd'hui. */
  highlightlyUsedToday?: number;
  /** Clé API-Sports. Absente = pas de secours supplémentaire. */
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
  const providers: SportsDataProvider[] = [];
  const skipped: { provider: string; reason: string }[] = [];

  // 1. TheSportsDB — principal
  if (env.thesportsdbKey) {
    providers.push(createTheSportsDbProvider({ apiKey: env.thesportsdbKey }));
  } else {
    skipped.push({ provider: THESPORTSDB, reason: "clé THESPORTSDB_KEY absente" });
  }

  // 2. Highlightly — second
  if (env.highlightlyKey) {
    const quota = env.highlightlyQuota ?? undefined;
    const used = env.highlightlyUsedToday ?? 0;
    if (quota !== undefined && used >= quota) {
      skipped.push({
        provider: HIGHLIGHTLY,
        reason: `quota journalier atteint (${used}/${quota} requêtes)`,
      });
    } else {
      providers.push(
        createHighlightlyProvider({ apiKey: env.highlightlyKey, dailyQuota: quota }),
      );
    }
  } else {
    skipped.push({ provider: HIGHLIGHTLY, reason: "clé HIGHLIGHTLY_KEY absente" });
  }

  // 3. ESPN — troisième (gratuit, toujours disponible)
  providers.push(createEspnProvider());

  // 4. API-Sports — dernier recours
  if (env.apisportsKey) {
    const quota = env.apisportsQuota ?? undefined;
    const used = env.apisportsUsedToday ?? 0;
    if (quota !== undefined && used >= quota) {
      skipped.push({
        provider: APISPORTS,
        reason: `quota journalier atteint (${used}/${quota} requêtes)`,
      });
    } else {
      providers.push(
        createApiSportsProvider({ apiKey: env.apisportsKey, dailyQuota: quota }),
      );
    }
  } else {
    skipped.push({ provider: APISPORTS, reason: "clé APISPORTS_KEY absente" });
  }

  return { providers, skipped };
}

/** Les trois natures de synchronisation, qui n'ont pas les mêmes besoins. */
export type SyncKind = "calendar" | "live" | "standings";

/**
 * L'ordre de préférence par nature de synchronisation.
 *
 * TheSportsDB en tête partout : 30 req/min, pas de quota journalier, données
 * décalées de 5-10 min (acceptable pour des pronostics). Highlightly en second
 * (100 req/jour, mais API structurée et fiable). ESPN en troisième (gratuit
 * mais non documenté). API-Sports en dernier (100 req/jour, saisons limitées
 * en gratuit).
 *
 * Ces valeurs vivent dans `app_settings` (`sync.provider_order`) : les changer
 * ne demande pas de redéploiement.
 */
export const DEFAULT_PROVIDER_ORDER: Record<SyncKind, string[]> = {
  calendar: [THESPORTSDB, HIGHLIGHTLY, ESPN, APISPORTS],
  live: [THESPORTSDB, HIGHLIGHTLY, ESPN, APISPORTS],
  standings: [THESPORTSDB, HIGHLIGHTLY, ESPN, APISPORTS],
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

export { APISPORTS, ESPN, HIGHLIGHTLY, THESPORTSDB };
