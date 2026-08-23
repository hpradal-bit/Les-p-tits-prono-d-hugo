/**
 * Synchronisation du classement sportif réel de la compétition.
 *
 * Rien à voir avec le classement des joueurs : c'est le tableau du Top 14, tel
 * qu'il s'affiche dans le Match Center. Un appel par jour suffit.
 */

import { TeamResolver } from "../refs.ts";
import { loadSeasonExternalId } from "../refs.ts";
import { runWithFallback } from "../registry.ts";
import { ProviderError } from "../types.ts";
import type { SyncContext } from "./context.ts";
import { closeRun, openRun, recordProviderUsage, type SyncRunResult } from "./runs.ts";

export interface StandingsSyncReport {
  status: SyncRunResult["status"];
  provider: string;
  requestsUsed: number;
  rowsReceived: number;
  rowsWritten: number;
  unmatched: string[];
  warnings: string[];
  error?: string;
}

export async function syncStandings(ctx: SyncContext): Promise<StandingsSyncReport> {
  const { sb } = ctx;
  const run = await openRun(sb, "standings");

  const outcome = await runWithFallback(ctx.chain, async (provider) => {
    const externalId = await loadSeasonExternalId(
      sb,
      provider.name,
      ctx.season.id,
      ctx.season.competitionId,
    );
    if (!externalId) {
      throw new ProviderError(
        provider.name,
        `aucune référence de saison dans external_refs pour ${ctx.season.label}`,
      );
    }
    return provider.getStandings(externalId);
  });

  const requestsUsed = Object.values(outcome.requestsByProvider).reduce((a, b) => a + b, 0);
  await recordProviderUsage(sb, "standings", outcome.attempts, outcome.requestsByProvider);

  if (!outcome.response) {
    const error = outcome.attempts
      .filter((a) => !a.ok)
      .map((a) => `${a.provider} : ${a.error}`)
      .join(" · ");
    await closeRun(sb, run, {
      status: "failed",
      provider: "chain",
      requestsUsed,
      fixturesUpdated: 0,
      error,
      detail: { attempts: outcome.attempts },
    });
    return {
      status: "failed",
      provider: "chain",
      requestsUsed,
      rowsReceived: 0,
      rowsWritten: 0,
      unmatched: [],
      warnings: ["aucun fournisseur joignable : le dernier classement connu est conservé"],
      error,
    };
  }

  const provider = outcome.response.provider;
  const warnings = [...outcome.response.warnings];
  const unmatched: string[] = [];
  const resolver = await TeamResolver.create(sb, provider, ctx.teams, ctx.aliases);

  const rows = [];
  for (const row of outcome.response.data) {
    const resolved = resolver.resolve(row.team);
    if (!resolved.teamId) {
      unmatched.push(`${row.team.name} : ${resolved.note}`);
      continue;
    }
    rows.push({
      season_id: ctx.season.id,
      team_id: resolved.teamId,
      position: row.position,
      played: row.played,
      won: row.won,
      drawn: row.drawn,
      lost: row.lost,
      points_for: row.pointsFor,
      points_against: row.pointsAgainst,
      bonus_offensive: row.bonusOffensive,
      bonus_defensive: row.bonusDefensive,
      points: row.points,
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length > 0) {
    const { error } = await sb
      .from("competition_standings")
      .upsert(rows, { onConflict: "season_id,team_id" });
    if (error) {
      await closeRun(sb, run, {
        status: "failed",
        provider,
        requestsUsed,
        fixturesUpdated: 0,
        error: error.message,
        detail: { attempts: outcome.attempts },
      });
      return {
        status: "failed",
        provider,
        requestsUsed,
        rowsReceived: outcome.response.data.length,
        rowsWritten: 0,
        unmatched,
        warnings,
        error: error.message,
      };
    }
  }

  await resolver.flush(sb);

  const status: SyncRunResult["status"] = unmatched.length > 0 ? "partial" : "success";
  await closeRun(sb, run, {
    status,
    provider,
    requestsUsed,
    fixturesUpdated: 0,
    error: unmatched.length > 0 ? `équipes non rapprochées : ${unmatched.length}` : null,
    detail: {
      received: outcome.response.data.length,
      written: rows.length,
      unmatched,
      warnings,
      attempts: outcome.attempts,
    },
  });

  return {
    status,
    provider,
    requestsUsed,
    rowsReceived: outcome.response.data.length,
    rowsWritten: rows.length,
    unmatched,
    warnings,
  };
}
