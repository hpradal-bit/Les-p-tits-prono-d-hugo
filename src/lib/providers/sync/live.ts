/**
 * Repousse le prochain passage si le fournisseur qui a répondu a un quota.
 *
 * On ne ralentit que le fournisseur concerné : ESPN n'a pas de quota et ne
 * doit pas payer la prudence due à un autre.
 */
function paceNextCheck(
  ctx: SyncContext,
  provider: string,
  now: Date,
  proposed: string,
): string {
  const chained = ctx.chain.providers.find((p) => p.name === provider);
  if (!chained?.dailyQuota) return proposed;

  const remaining = chained.dailyQuota - ctx.apisportsUsedToday;
  const asked = Math.max(1, Math.round((new Date(proposed).getTime() - now.getTime()) / 60_000));
  const paced = paceToQuota(asked, remaining, minutesLeftInDay(now));

  return paced === asked ? proposed : new Date(now.getTime() + paced * 60_000).toISOString();
}

/**
 * Synchronisation des scores en direct.
 *
 * Elle commence par se demander si elle a lieu d'être : hors fenêtre de match,
 * et si la dernière synchro est récente, elle ne consomme rien et renvoie au
 * planificateur l'heure du prochain passage. C'est ce qui permet de tenir avec
 * 100 requêtes par jour chez le fournisseur de secours.
 */

// Chemins relatifs : le lanceur de tests ne résout pas le raccourci « @/ »
// pour les imports de valeur, et ce module est désormais couvert.
import { setting } from "../../settings/index.ts";
import { recomputeFixtures } from "../../scoring/persist.ts";
import { evaluateWindow, localDateKey, minutesLeftInDay, paceToQuota } from "../schedule.ts";
import { planLiveUpdate } from "../reconcile.ts";
import { TeamResolver, loadRefs, loadSeasonExternalId } from "../refs.ts";
import { describeError, runWithFallback } from "../registry.ts";
import { ProviderError } from "../types.ts";
import type { SyncContext } from "./context.ts";
import {
  applyFixturePatch,
  loadFixturesBetween,
  loadSeasonFixtures,
} from "./fixtures-repo.ts";
import { closeRun, lastSuccessfulRun, openRun, recordProviderUsage, type SyncRunResult } from "./runs.ts";

export interface LiveSyncOptions {
  /** Date à interroger (`YYYY-MM-DD`). Par défaut : aujourd'hui, heure de Paris. */
  date?: string;
  /** Ignore la fenêtre de match et interroge quand même. */
  force?: boolean;
  /**
   * Le calcul des points, injectable pour les tests.
   *
   * Cette couture existe pour une raison précise : l'appel avait été *oublié*,
   * et rien ne le signalait — le relevé écrivait les scores, émettait ses
   * événements, et laissait le classement à zéro. Un test qui vérifie
   * simplement « le relevé a réussi » ne l'aurait jamais vu passer.
   */
  recompute?: (sb: SyncContext["sb"], fixtureIds: string[]) => Promise<{
    fixtures: number;
    predictions: number;
  }>;
  now?: Date;
}

export interface LiveSyncReport {
  status: SyncRunResult["status"];
  provider: string;
  requestsUsed: number;
  inWindow: boolean;
  /** Quand le planificateur doit rappeler cette route. */
  nextCheckAt: string;
  fixturesUpdated: number;
  finished: string[];
  /** Pronostics notés à la suite des matchs qui viennent de se terminer. */
  predictionsScored: number;
  changes: string[];
  warnings: string[];
  /** Âge de la dernière donnée connue si la synchro a échoué. */
  lastKnownAt?: string | null;
  error?: string;
}

export async function syncLive(
  ctx: SyncContext,
  options: LiveSyncOptions = {},
): Promise<LiveSyncReport> {
  const { sb } = ctx;
  const now = options.now ?? new Date();

  const windowSettings = {
    liveIntervalMinutes: setting(ctx.settings, "sync.live_interval_minutes", 5),
    idleIntervalMinutes: setting(ctx.settings, "sync.idle_interval_minutes", 60),
    matchWindowMinutes: setting(ctx.settings, "sync.match_window_minutes", 135),
  };

  // Toute exécution ouvre une ligne de journal, y compris celle qui décide de
  // ne rien faire : c'est ce qui permet de vérifier que le planificateur tourne.
  const run = await openRun(sb, "live");

  const seasonFixtures = await loadSeasonFixtures(sb, ctx.season.id);
  const verdict = evaluateWindow(now, seasonFixtures, windowSettings);

  // Hors fenêtre : on ne dépense rien, sauf si la dernière synchro est vieille
  // (ce passage horaire maintient aussi le projet Supabase éveillé).
  if (!verdict.inWindow && !options.force) {
    const last = await lastSuccessfulRun(sb, "live");
    const idleMs = windowSettings.idleIntervalMinutes * 60_000;
    const recent =
      last !== null && now.getTime() - new Date(last.finishedAt).getTime() < idleMs;

    if (recent) {
      await closeRun(sb, run, {
        status: "skipped",
        provider: "aucun",
        requestsUsed: 0,
        fixturesUpdated: 0,
        detail: { reason: "hors fenêtre de match", nextCheckAt: verdict.nextCheckAt },
      });
      return {
        status: "skipped",
        provider: "aucun",
        requestsUsed: 0,
        inWindow: false,
        nextCheckAt: verdict.nextCheckAt,
        fixturesUpdated: 0,
        finished: [],
        predictionsScored: 0,
        changes: [],
        warnings: [],
        lastKnownAt: last?.finishedAt ?? null,
      };
    }
  }

  const date = options.date ?? localDateKey(now);

  const outcome = await runWithFallback(ctx.chainFor("live"), async (provider) => {
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
    return provider.getLiveScores(externalId, date);
  });

  const requestsUsed = Object.values(outcome.requestsByProvider).reduce((a, b) => a + b, 0);
  await recordProviderUsage(sb, "live", outcome.attempts, outcome.requestsByProvider);

  if (!outcome.response) {
    // Les deux fournisseurs sont muets : la base garde le dernier score connu,
    // l'écran affichera « dernière mise à jour il y a X minutes ».
    const error = outcome.attempts
      .filter((a) => !a.ok)
      .map((a) => `${a.provider} : ${a.error}`)
      .join(" · ");
    const last = await lastSuccessfulRun(sb, "live");
    await closeRun(sb, run, {
      status: "failed",
      provider: "chain",
      requestsUsed,
      fixturesUpdated: 0,
      error,
      detail: { date, attempts: outcome.attempts, lastKnownAt: last?.finishedAt ?? null },
    });
    return {
      status: "failed",
      provider: "chain",
      requestsUsed,
      inWindow: verdict.inWindow,
      nextCheckAt: verdict.nextCheckAt,
      fixturesUpdated: 0,
      finished: [],
      predictionsScored: 0,
      changes: [],
      warnings: ["aucun fournisseur joignable : le dernier score connu est conservé"],
      lastKnownAt: last?.finishedAt ?? null,
      error,
    };
  }

  const provider = outcome.response.provider;
  const warnings = [...outcome.response.warnings];
  const changes: string[] = [];
  const finished: string[] = [];
  const unmatched: string[] = [];

  const officialAfterMinutes = setting(ctx.settings, "sync.official_after_minutes", 180);

  // On ne compare qu'aux matchs du jour : deux jours de marge suffisent.
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const candidates = await loadFixturesBetween(
    sb,
    ctx.season.id,
    new Date(dayStart.getTime() - 86_400_000).toISOString(),
    new Date(dayStart.getTime() + 2 * 86_400_000).toISOString(),
  );

  const [resolver, fixtureRefs] = await Promise.all([
    TeamResolver.create(sb, provider, ctx.teams, ctx.aliases),
    loadRefs(sb, provider, "fixture"),
  ]);

  const byId = new Map(candidates.map((f) => [f.id, f]));
  const byPair = new Map(candidates.map((f) => [`${f.homeTeamId}|${f.awayTeamId}`, f]));

  let fixturesUpdated = 0;

  for (const incoming of outcome.response.data) {
    const home = resolver.resolve(incoming.homeTeam);
    const away = resolver.resolve(incoming.awayTeam);
    if (!home.teamId || !away.teamId) {
      unmatched.push(`${incoming.homeTeam.name} – ${incoming.awayTeam.name}`);
      continue;
    }

    const knownId = fixtureRefs.byExternalId.get(incoming.externalId);
    const existing =
      (knownId ? byId.get(knownId) : undefined) ?? byPair.get(`${home.teamId}|${away.teamId}`);
    if (!existing) {
      warnings.push(
        `match inconnu au calendrier : ${incoming.homeTeam.name} – ${incoming.awayTeam.name}` +
          " (lancer /api/sync/calendar)",
      );
      continue;
    }

    const plan = planLiveUpdate(existing, incoming, { provider, now, officialAfterMinutes });
    if (Object.keys(plan.patch).length === 0) continue;

    await applyFixturePatch(sb, existing.id, plan.patch);
    fixturesUpdated += 1;
    changes.push(`${existing.id} · ${plan.reasons.join(" ; ")}`);

    // Un match qui vient de se terminer alimente le flux d'événements : le fil,
    // les badges et les notifications le liront, ils ne le recalculent pas.
    const becameFinal = plan.patch.status === "finished" || plan.patch.status === "official";
    if (becameFinal) {
      finished.push(existing.id);
      await emitFixtureFinished(ctx, existing.id, {
        homeScore: plan.patch.home_score ?? existing.homeScore,
        awayScore: plan.patch.away_score ?? existing.awayScore,
        status: plan.patch.status,
        provider,
      });
    }
  }

  await resolver.flush(sb);

  // Un score écrit ne vaut rien tant que les points ne suivent pas. C'était le
  // maillon manquant : le relevé constatait la fin d'un match, émettait
  // l'événement, et laissait le classement à zéro — la panne ne se serait vue
  // qu'un samedi soir de septembre, une fois les matchs joués.
  //
  // Le calcul est une fonction pure et rejouable : le relancer sur un match
  // déjà noté redonne le même résultat, donc un doublon ne coûte rien.
  let predictionsScored = 0;
  if (finished.length > 0) {
    try {
      const summary = await (options.recompute ?? recomputeFixtures)(sb, finished);
      predictionsScored = summary.predictions;
      changes.push(`${summary.predictions} pronostic(s) noté(s) sur ${summary.fixtures} match(s)`);
    } catch (error) {
      // Le score, lui, est déjà écrit : on ne perd rien en signalant plutôt
      // qu'en échouant. L'admin peut relancer le calcul d'un revers de main.
      warnings.push(`points non calculés : ${describeError(error)} — relancer depuis l'espace admin`);
    }
  }

  const status: SyncRunResult["status"] = unmatched.length > 0 ? "partial" : "success";
  await closeRun(sb, run, {
    status,
    provider,
    requestsUsed,
    fixturesUpdated,
    error: unmatched.length > 0 ? `équipes non rapprochées : ${unmatched.join(", ")}` : null,
    detail: {
      date,
      inWindow: verdict.inWindow,
      activeKickoffs: verdict.activeKickoffs,
      changes: changes.slice(0, 50),
      warnings,
      predictionsScored,
      attempts: outcome.attempts,
    },
  });

  // La fenêtre est réévaluée après écriture : un match qui vient de se terminer
  // ne doit plus déclencher d'appel dans cinq minutes.
  const after = evaluateWindow(
    now,
    seasonFixtures.map((f) =>
      finished.includes(f.id) ? { ...f, status: "official" as const } : f,
    ),
    windowSettings,
  );

  // Si le fournisseur qui a répondu a un quota, on espace le prochain passage
  // pour qu'il tienne jusqu'à minuit. Des scores toutes les vingt minutes
  // jusqu'au coup de sifflet final valent mieux que toutes les dix jusqu'à
  // 17 h, puis plus rien.
  const nextCheckAt = paceNextCheck(ctx, provider, now, after.nextCheckAt);

  return {
    status,
    provider,
    requestsUsed,
    inWindow: verdict.inWindow,
    nextCheckAt,
    fixturesUpdated,
    finished,
    predictionsScored,
    changes,
    warnings,
  };
}

/**
 * Écrit un événement `fixture_finished`. Une erreur ici ne doit pas faire
 * échouer la synchronisation : le score, lui, est déjà en base.
 */
async function emitFixtureFinished(
  ctx: SyncContext,
  fixtureId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await ctx.sb.from("events").insert({
    kind: "fixture_finished",
    season_id: ctx.season.id,
    fixture_id: fixtureId,
    payload,
  });
  if (error) console.error("[sync] événement non écrit :", error.message);
}
