/**
 * Accès réseau des fournisseurs : minimal, défensif, injectable.
 *
 * Injectable parce que les tests ne doivent jamais sortir sur le réseau : les
 * implémentations reçoivent un `JsonFetcher` et les tests en fournissent un qui
 * renvoie des échantillons de réponse.
 */

import { ProviderError } from "./types.ts";

export interface JsonFetchOptions {
  headers?: Record<string, string>;
  /** Délai maximal, en millisecondes. Au-delà, on abandonne et on bascule. */
  timeoutMs?: number;
  /** Nombre de nouvelles tentatives sur erreur réseau ou 5xx. */
  retries?: number;
}

export type JsonFetcher = (url: string, options?: JsonFetchOptions) => Promise<unknown>;

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRIES = 1;

/** Attente entre deux tentatives : courte, on est dans une requête HTTP. */
function backoffMs(attempt: number): number {
  return 300 * 2 ** attempt;
}

/**
 * `fetch` + JSON, avec délai maximal et une nouvelle tentative. Toute anomalie
 * lève une `ProviderError` : la bascule vers le fournisseur de secours est
 * décidée plus haut, jamais ici.
 */
export function createJsonFetcher(provider: string): JsonFetcher {
  return async function fetchJson(url, options = {}) {
    const { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES } = options;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          headers: { accept: "application/json", ...headers },
          signal: controller.signal,
          cache: "no-store",
        });

        if (res.status === 429) {
          throw new ProviderError(provider, "quota ou cadence dépassée (HTTP 429)");
        }
        if (res.status >= 500) {
          throw new ProviderError(provider, `erreur serveur (HTTP ${res.status})`);
        }
        if (!res.ok) {
          throw new ProviderError(provider, `réponse inattendue (HTTP ${res.status})`);
        }

        const text = await res.text();
        try {
          return JSON.parse(text) as unknown;
        } catch (cause) {
          throw new ProviderError(provider, "réponse illisible : ce n'est pas du JSON", cause);
        }
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof ProviderError
            ? /HTTP 5|429/.test(error.message)
            : true; // abandon réseau ou délai dépassé
        if (!retryable || attempt === retries) break;
        await new Promise((r) => setTimeout(r, backoffMs(attempt)));
      } finally {
        clearTimeout(timer);
      }
    }

    if (lastError instanceof ProviderError) throw lastError;
    throw new ProviderError(provider, "appel impossible", lastError);
  };
}

// --- Lecture défensive de JSON inconnu --------------------------------------
// Les réponses des fournisseurs ne sont pas des contrats : ESPN peut changer
// sans préavis. On lit champ par champ, on ne suppose rien.

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Descente sûre dans un objet : `dig(json, "status", "type", "state")`. */
export function dig(value: unknown, ...path: string[]): unknown {
  let cursor: unknown = value;
  for (const key of path) {
    const record = asRecord(cursor);
    if (!record) return undefined;
    cursor = record[key];
  }
  return cursor;
}
