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

export type SyncKind = "calendar" | "live" | "standings";
export type SyncStatus = "running" | "success" | "partial" | "skipped" | "failed";

export interface SyncRunHandle {
  id: string | null;
  startedAt: string;
}

export interface SyncRunResult {
  status: SyncStatus;
  provider: string;
  requestsUsed: number;
  fixturesUpdated: number;
  error?: string | null;
  detail?: Record<string, unknown>;
}

/** Ouvre une ligne `sync_runs`. Ne fait jamais échouer la synchronisation. */
export async function openRun(
  sb: SupabaseClient,
  kind: SyncKind,
  provider = "chain",
): Promise<SyncRunHandle> {
  const startedAt = new Date().toISOString();
  const { data, error } = await sb
    .from("sync_runs")
    .insert({ kind, provider, status: "running", started_at: startedAt })
    .select("id")
    .single();

  if (error) {
    console.error("[sync] impossible d'ouvrir le journal :", error.message);
    return { id: null, startedAt };
  }
  return { id: data.id, startedAt };
}

/** Referme la ligne. Une erreur d'écriture est journalisée, jamais propagée. */
export async function closeRun(
  sb: SupabaseClient,
  handle: SyncRunHandle,
  result: SyncRunResult,
): Promise<void> {
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

  if (error) console.error("[sync] impossible de refermer le journal :", error.message);
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
  if (error) console.error("[sync] usage fournisseur non journalisé :", error.message);
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
