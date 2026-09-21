/**
 * Le journal des synchronisations (`sync_runs`).
 *
 * Chaque exécution ouvre une ligne et la referme, qu'elle réussisse ou non.
 * C'est ce qui permet, six mois plus tard, de répondre à « pourquoi le score
 * n'a pas bougé samedi soir ? » — et c'est aussi le compteur du quota
 * API-Sports.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttemptLog } from "../registry.ts";
import { logger } from "../../log.ts";

export type SyncKind = "calendar" | "live" | "standings";
export type SyncStatus = "running" | "success" | "partial" | "skipped" | "failed";

export interface SyncRunHandle {
  id: string | null;
  startedAt: string;
  kind: SyncKind;
  /**
   * `false` si un autre run du même `kind` tenait déjà le verrou (audit P2,
   * point 6) : l'appelant doit alors s'arrêter tout de suite, sans consommer
   * de requête fournisseur ni toucher aux fixtures — un deuxième appel
   * concurrent (double clic sur `/admin/synchronisation`, ou plusieurs
   * planificateurs en parallèle demain) ne doit jamais faire deux appels
   * fournisseur redondants ni deux écritures simultanées.
   */
  locked: boolean;
}

/**
 * Le verrou anti-concurrence d'une synchronisation.
 *
 * Une seule ligne par `kind` dans `sync_locks` (migration `0063`) :
 * l'acquisition passe par la fonction SQL `try_acquire_sync_lock`, qui fait
 * l'insertion/mise à jour et le test de fraîcheur **dans la même
 * transaction** côté PostgreSQL — impossible à obtenir de façon fiable avec
 * une lecture puis une écriture séparées depuis Node, qui laisserait une
 * fenêtre de course entre les deux appels.
 *
 * Un verrou plus vieux que `staleAfterMinutes` est considéré abandonné (une
 * synchronisation qui a planté sans jamais appeler `closeRun`/`releaseLock`)
 * et peut être repris — sans quoi un run mort bloquerait tous les suivants
 * pour toujours.
 */
async function acquireLock(
  sb: SupabaseClient,
  kind: SyncKind,
  staleAfterMinutes = 15,
): Promise<boolean> {
  const { data, error } = await sb.rpc("try_acquire_sync_lock", {
    p_kind: kind,
    p_stale_after_minutes: staleAfterMinutes,
  });
  if (error) {
    // Le verrou est une protection additionnelle, pas une dépendance dure :
    // si la fonction SQL n'est pas encore déployée (migration pas encore
    // appliquée en production, cf. rapport de remédiation), la synchro
    // continue de fonctionner comme avant plutôt que de se bloquer.
    logger.warn("sync.lock.acquire_failed", { kind, error });
    return true;
  }
  return data === true;
}

/** Relâche le verrou — toujours appelé, que le run ait réussi ou échoué. */
async function releaseLock(sb: SupabaseClient, kind: SyncKind): Promise<void> {
  const { error } = await sb.rpc("release_sync_lock", { p_kind: kind });
  if (error) logger.warn("sync.lock.release_failed", { kind, error });
}

export interface SyncRunResult {
  status: SyncStatus;
  provider: string;
  requestsUsed: number;
  fixturesUpdated: number;
  error?: string | null;
  detail?: Record<string, unknown>;
}

/**
 * Ouvre une ligne `sync_runs`, après avoir tenté de prendre le verrou du
 * `kind`. Ne fait jamais échouer la synchronisation : ni l'échec du verrou,
 * ni l'échec de l'écriture du journal ne remontent une exception.
 */
export async function openRun(
  sb: SupabaseClient,
  kind: SyncKind,
  provider = "chain",
): Promise<SyncRunHandle> {
  const startedAt = new Date().toISOString();
  const locked = await acquireLock(sb, kind);

  const { data, error } = await sb
    .from("sync_runs")
    .insert({
      kind,
      provider,
      status: locked ? "running" : "skipped",
      started_at: startedAt,
      ...(locked ? {} : { finished_at: startedAt, error: "synchronisation déjà en cours (verrou occupé)" }),
    })
    .select("id")
    .single();

  if (error) {
    logger.error("sync.run.open_failed", { kind, error });
    return { id: null, startedAt, locked, kind };
  }
  return { id: data.id, startedAt, locked, kind };
}

/**
 * Referme la ligne et relâche le verrou pris par `openRun`. Une erreur
 * d'écriture est journalisée, jamais propagée.
 */
export async function closeRun(
  sb: SupabaseClient,
  handle: SyncRunHandle,
  result: SyncRunResult,
): Promise<void> {
  if (handle.locked) await releaseLock(sb, handle.kind);
  if (!handle.id) return;
  const { error } = await sb
    .from("sync_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: result.status,
      provider: result.provider,
      requests_used: result.requestsUsed,
      fixtures_updated: result.fixturesUpdated,
      error: result.error ?? null,
      detail: result.detail ?? {},
    })
    .eq("id", handle.id);

  if (error) logger.error("sync.run.close_failed", { error });
}

/**
 * Le grand livre du quota : une ligne par fournisseur réellement appelé.
 *
 * Ces lignes portent `detail.ledger = true`. C'est ce qui les distingue de la
 * ligne récapitulative de la synchronisation, qui compte les mêmes requêtes :
 * seul le grand livre est additionné pour savoir ce qu'il reste du quota
 * API-Sports, sans quoi chaque requête serait comptée deux fois.
 */
export async function recordProviderUsage(
  sb: SupabaseClient,
  kind: SyncKind,
  attempts: AttemptLog[],
  requestsByProvider: Record<string, number>,
): Promise<void> {
  const now = new Date().toISOString();
  const rows = Object.entries(requestsByProvider)
    .filter(([, used]) => used > 0)
    .map(([provider, used]) => {
      const attempt = attempts.find((a) => a.provider === provider);
      return {
        provider,
        kind,
        started_at: now,
        finished_at: now,
        status: attempt?.ok ? "success" : "failed",
        requests_used: used,
        fixtures_updated: 0,
        error: attempt?.ok ? null : (attempt?.error ?? null),
        detail: { ledger: true },
      };
    });

  if (rows.length === 0) return;
  const { error } = await sb.from("sync_runs").insert(rows);
  if (error) logger.error("sync.provider_usage.not_recorded", { kind, error });
}

/** La dernière synchronisation réussie d'un type donné. */
export async function lastSuccessfulRun(
  sb: SupabaseClient,
  kind: SyncKind,
): Promise<{ finishedAt: string; provider: string } | null> {
  const { data, error } = await sb
    .from("sync_runs")
    .select("finished_at, provider")
    .eq("kind", kind)
    .in("status", ["success", "partial"])
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return { finishedAt: data.finished_at, provider: data.provider };
}
