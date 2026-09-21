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
import { sweepOrphanedPowers } from "../../powers/resolve.ts";
import {
  evaluateWindow,
  findFrozenFixtures,
  findStaleFixtures,
  localDateKey,
  minutesLeftInDay,
  paceToQuota,
  staleDatesToQuery,
} from "../schedule.ts";
import {
  corroborateScore,
  planLiveUpdate,
  type ScoreOpinion,
  type StoredFixture,
} from "../reconcile.ts";
import { TeamResolver, loadRefs, loadSeasonExternalId } from "../refs.ts";
import { describeError, runWithFallback } from "../registry.ts";
import { ProviderError, type ProviderFixture } from "../types.ts";
import type { SyncContext } from "./context.ts";
import {
  applyFixturePatch,
  loadFixturesBetween,
  loadSeasonFixtures,
} from "./fixtures-repo.ts";
import { closeRun, lastSuccessfulRun, openRun, recordProviderUsage, type SyncRunResult } from "./runs.ts";
import { logger } from "../../log.ts";

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

export interface FinishedFixtureDetail {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
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
  /** Détails des matchs terminés, pour les notifications. */
  finishedDetails: FinishedFixtureDetail[];
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

  // Audit P2, point 6 : une synchro « live » du même kind est déjà en cours
  // (verrou occupé) — on s'arrête immédiatement, sans consommer de requête
  // fournisseur ni relire les fixtures, plutôt que de risquer deux écritures
  // concurrentes des mêmes scores/événements.
  if (!run.locked) {
    return {
      status: "skipped",
      provider: "aucun",
      requestsUsed: 0,
      inWindow: false,
      nextCheckAt: new Date(now.getTime() + 60_000).toISOString(),
      fixturesUpdated: 0,
      finished: [],
      finishedDetails: [],
      predictionsScored: 0,
      changes: [],
      warnings: ["synchronisation déjà en cours (verrou occupé)"],
    };
  }

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
        finishedDetails: [],
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
      finishedDetails: [],
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
  // Quand on recoupe, l'officialisation revient a la passe de recoupement.
  const requireCorroboration = setting(ctx.settings, "sync.require_corroboration", true);
  const finishedDetails: LiveSyncReport["finishedDetails"] = [];

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

  let fixturesUpdated = 0;

  const batch = await applyProviderBatch(ctx, {
    incoming: outcome.response.data,
    candidates,
    resolver,
    fixtureRefs,
    provider,
    now,
    officialAfterMinutes,
    deferOfficial: requireCorroboration,
  });
  fixturesUpdated += batch.updated;
  changes.push(...batch.changes);
  finished.push(...batch.finished);
  finishedDetails.push(...batch.finishedDetails);
  unmatched.push(...batch.unmatched);
  warnings.push(...batch.warnings);

  // --- Rattrapage des matchs abandonnés par la fenêtre ----------------------
  //
  // La passe normale n'interroge que les matchs du jour. Un match dont le
  // fournisseur n'a jamais annoncé la fin sort de sa fenêtre et n'est plus
  // jamais redemandé : il reste `live` avec un score figé en cours de match.
  // Ce second passage va rechercher ces matchs à *leur* date.
  const staleSettings = {
    matchWindowMinutes: windowSettings.matchWindowMinutes,
    lookbackDays: setting(ctx.settings, "sync.catchup_lookback_days", 14),
  };
  const maxCatchupDates = setting(ctx.settings, "sync.catchup_max_dates_per_run", 2);

  const stale = findStaleFixtures(now, seasonFixtures, staleSettings);
  const catchupDates = staleDatesToQuery(stale, maxCatchupDates).filter((d) => d !== date);

  for (const staleDate of catchupDates) {
    const dayStart = new Date(`${staleDate}T00:00:00.000Z`);
    const dayCandidates = await loadFixturesBetween(
      sb,
      ctx.season.id,
      new Date(dayStart.getTime() - 86_400_000).toISOString(),
      new Date(dayStart.getTime() + 2 * 86_400_000).toISOString(),
    );

    // On interroge TOUS les fournisseurs de la chaîne pour ce jour-là, pas
    // seulement le premier qui répond. `runWithFallback` s'arrête au premier
    // succès — juste pour repérer une panne, pas une lacune de couverture.
    // Or un match resté bloqué peut très bien être absent du relevé « par
    // date » d'un fournisseur qui répond pourtant sans erreur (couverture
    // incomplète d'une compétition) : c'était le cas le 19 septembre, où
    // TheSportsDB ne connaissait qu'un match sur six du multiplexe de 16h35,
    // les cinq autres n'ayant de référence que chez ESPN — jamais consulté
    // puisque TheSportsDB n'avait techniquement pas échoué.
    let sawAnyProvider = false;
    for (const p of ctx.chainFor("live").providers) {
      const attempt = await runWithFallback({ providers: [p], skipped: [] }, async (provider) => {
        const externalId = await loadSeasonExternalId(
          sb,
          provider.name,
          ctx.season.id,
          ctx.season.competitionId,
        );
        if (!externalId) {
          throw new ProviderError(provider.name, `aucune référence de saison pour ${ctx.season.label}`);
        }
        return provider.getLiveScores(externalId, staleDate);
      });

      await recordProviderUsage(sb, "live", attempt.attempts, attempt.requestsByProvider);
      if (!attempt.response) continue;
      sawAnyProvider = true;

      const caught = await applyProviderBatch(ctx, {
        incoming: attempt.response.data,
        candidates: dayCandidates,
        resolver,
        fixtureRefs,
        provider: attempt.response.provider,
        now,
        officialAfterMinutes,
        deferOfficial: requireCorroboration,
      });

      fixturesUpdated += caught.updated;
      finished.push(...caught.finished);
      finishedDetails.push(...caught.finishedDetails);
      changes.push(...caught.changes.map((c) => `rattrapage ${staleDate} (${p.name}) · ${c}`));
    }

    if (!sawAnyProvider) {
      warnings.push(`rattrapage du ${staleDate} : aucun fournisseur joignable`);
    }
  }

  // --- Recoupement avant le passage en officiel ----------------------------
  //
  // Le passage en « officiel » est le point de non-retour : après lui, la
  // synchro n'a plus le droit de corriger le score. On exige donc qu'un second
  // fournisseur, indépendant du premier, dise la même chose.
  //
  // C'est ce qui manquait le 5 septembre : la chaîne est un repli en cascade,
  // le premier qui répond gagne. TheSportsDB répondait toujours — avec un score
  // figé — et les trois autres fournisseurs n'étaient jamais interrogés.
  if (requireCorroboration) {
    const promoted = await corroborateAndPromote(ctx, {
      resolver,
      fixtureRefs,
      primaryProvider: provider,
      now,
      officialAfterMinutes,
      maxDates: setting(ctx.settings, "sync.corroboration_max_dates_per_run", 1),
    });
    fixturesUpdated += promoted.updated;
    changes.push(...promoted.changes);
    warnings.push(...promoted.warnings);
  }

  // Un score écrit ne vaut rien tant que les points ne suivent pas. C'était le
  // maillon manquant : le relevé constatait la fin d'un match, émettait
  // l'événement, et laissait le classement à zéro — la panne ne se serait vue
  // qu'un samedi soir de septembre, une fois les matchs joués.
  //
  // Le calcul est une fonction pure et rejouable : le relancer sur un match
  // déjà noté redonne le même résultat, donc un doublon ne coûte rien.
  //
  // Avant tout pouvoir : un Sabotage résolu ici lit les points du match visé
  // (`fixtureScores`) pour savoir combien il en retire. Résoudre les pouvoirs
  // avant que ce calcul n'ait tourné leur faisait lire un score encore à zéro —
  // un Sabotage sur un pronostic gagnant n'enlevait alors rien du tout.
  let predictionsScored = 0;
  if (finished.length > 0) {
    try {
      const summary = await (options.recompute ?? recomputeFixtures)(sb, finished);
      predictionsScored = summary.predictions;
      changes.push(`${summary.predictions} pronostic(s) noté(s) sur ${summary.fixtures} match(s)`);
    } catch (error) {
      warnings.push(`points non calculés : ${describeError(error)} — relancer depuis l'espace admin`);
    }
  }

  // Un pouvoir posé sur un match désormais terminé ne doit pas rester en
  // attente : le joueur a dépensé ses crédits. Trois l'étaient depuis le
  // 27 août, avant que la résolution match par match n'existe.
  try {
    const swept = await sweepOrphanedPowers(sb);
    if (swept.resolved > 0) {
      changes.push(`${swept.resolved} pouvoir(s) en attente résolu(s)`);
    }
  } catch (error) {
    warnings.push(`pouvoirs en attente non résolus : ${describeError(error)}`);
  }

  // Ce qui reste bloqué après le rattrapage doit se voir : un match encore
  // `live` trois jours après son coup d'envoi est une panne, pas un silence.
  const refreshedFixtures = await loadSeasonFixtures(sb, ctx.season.id);
  const stillStale = findStaleFixtures(now, refreshedFixtures, staleSettings);
  for (const f of stillStale) {
    warnings.push(
      `match ${f.id} toujours « ${f.status} » ${Math.round(f.elapsedMinutes / 60)} h après le coup ` +
        "d'envoi : le fournisseur n'a jamais annoncé la fin (saisir le résultat depuis l'admin)",
    );
  }

  // Repéré PENDANT la fenêtre de match, pas seulement après (§ findStaleFixtures
  // ci-dessus) : c'est l'angle mort qui avait laissé un score figé toute une
  // soirée le 16 septembre sans que rien ne le signale avant le lendemain.
  const frozenAfterMinutes = setting(ctx.settings, "sync.frozen_after_minutes", 20);
  const frozen = findFrozenFixtures(now, refreshedFixtures, frozenAfterMinutes);
  for (const f of frozen) {
    warnings.push(
      `match ${f.id} : aucune mise à jour depuis ${f.minutesSinceUpdate} min alors qu'il est en ` +
        "direct — le fournisseur semble figé (vérifier le score depuis l'espace admin)",
    );
  }

  await resolver.flush(sb);

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
    finishedDetails,
    predictionsScored,
    changes,
    warnings,
  };
}

/**
 * Demande un second avis à un fournisseur autre que celui qui a déjà répondu,
 * et ne laisse passer en « officiel » que les scores confirmés.
 *
 * Ne coûte une requête que s'il y a réellement un match à officialiser : hors
 * de ce moment précis, la fonction sort sans rien consommer.
 */
async function corroborateAndPromote(
  ctx: SyncContext,
  opts: {
    resolver: TeamResolver;
    fixtureRefs: Awaited<ReturnType<typeof loadRefs>>;
    primaryProvider: string;
    now: Date;
    officialAfterMinutes: number;
    maxDates: number;
  },
): Promise<{ updated: number; changes: string[]; warnings: string[] }> {
  const { sb } = ctx;
  const out = { updated: 0, changes: [] as string[], warnings: [] as string[] };

  // Qui est candidat au passage en officiel ? On relit la base : les patchs de
  // la passe précédente viennent d'être écrits.
  const fixtures = await loadSeasonFixtures(sb, ctx.season.id);
  const candidates = fixtures.filter((f) => {
    if (f.status !== "finished") return false;
    const elapsed = (opts.now.getTime() - new Date(f.kickoffAt).getTime()) / 60_000;
    return elapsed >= opts.officialAfterMinutes;
  });
  if (candidates.length === 0) return out;

  // Un second fournisseur, forcément différent du premier.
  const others = ctx
    .chainFor("live")
    .providers.filter((p) => p.name !== opts.primaryProvider);
  if (others.length === 0) {
    out.warnings.push(
      `${candidates.length} match(s) à officialiser sans second fournisseur pour recouper ` +
        "(renseigner HIGHLIGHTLY_KEY ou APISPORTS_KEY)",
    );
    return out;
  }

  const dates: string[] = [];
  for (const f of candidates) {
    const key = localDateKey(f.kickoffAt);
    if (!dates.includes(key)) dates.push(key);
    if (dates.length >= Math.max(1, opts.maxDates)) break;
  }

  for (const date of dates) {
    const second = await runWithFallback({ providers: others, skipped: [] }, async (p) => {
      const externalId = await loadSeasonExternalId(
        sb,
        p.name,
        ctx.season.id,
        ctx.season.competitionId,
      );
      if (!externalId) {
        throw new ProviderError(p.name, `aucune référence de saison pour ${ctx.season.label}`);
      }
      return p.getLiveScores(externalId, date);
    });

    await recordProviderUsage(sb, "live", second.attempts, second.requestsByProvider);

    if (!second.response) {
      out.warnings.push(
        `recoupement du ${date} impossible : aucun second fournisseur n'a répondu`,
      );
      continue;
    }

    // L'avis du second fournisseur, rangé par match de notre base.
    const opinions = new Map<string, ScoreOpinion>();
    const byPair = new Map(fixtures.map((f) => [`${f.homeTeamId}|${f.awayTeamId}`, f]));
    for (const incoming of second.response.data) {
      const home = opts.resolver.resolve(incoming.homeTeam);
      const away = opts.resolver.resolve(incoming.awayTeam);
      if (!home.teamId || !away.teamId) continue;
      const known = opts.fixtureRefs.byExternalId.get(incoming.externalId);
      const match =
        (known ? fixtures.find((f) => f.id === known) : undefined) ??
        byPair.get(`${home.teamId}|${away.teamId}`);
      if (!match) continue;
      opinions.set(match.id, {
        provider: second.response.provider,
        homeScore: incoming.homeScore,
        awayScore: incoming.awayScore,
      });
    }

    for (const fixture of candidates) {
      if (localDateKey(fixture.kickoffAt) !== date) continue;

      const verdict = corroborateScore(
        {
          provider: opts.primaryProvider,
          homeScore: fixture.homeScore,
          awayScore: fixture.awayScore,
        },
        opinions.get(fixture.id) ?? null,
      );

      if (verdict.verdict === "conflicting") {
        out.warnings.push(
          `${fixture.id} non officialisé : ${verdict.detail} — trancher depuis l'espace admin`,
        );
        continue;
      }

      await applyFixturePatch(sb, fixture.id, {
        status: "official",
        last_synced_at: opts.now.toISOString(),
      });
      out.updated += 1;
      out.changes.push(`${fixture.id} · officialisé — ${verdict.detail}`);
    }
  }

  return out;
}

interface BatchInput {
  incoming: ProviderFixture[];
  candidates: StoredFixture[];
  resolver: TeamResolver;
  fixtureRefs: Awaited<ReturnType<typeof loadRefs>>;
  provider: string;
  now: Date;
  officialAfterMinutes: number;
  /** Laisse l'officialisation a la passe de recoupement. */
  deferOfficial?: boolean;
}

interface BatchOutput {
  updated: number;
  changes: string[];
  finished: string[];
  finishedDetails: FinishedFixtureDetail[];
  unmatched: string[];
  warnings: string[];
}

/**
 * Rapproche une réponse de fournisseur des matchs en base et applique les
 * patchs. Extraite de `syncLive` pour servir aussi au rattrapage, qui rejoue
 * exactement la même logique sur une autre date.
 */
async function applyProviderBatch(
  ctx: SyncContext,
  input: BatchInput,
): Promise<BatchOutput> {
  const { sb } = ctx;
  const { resolver, fixtureRefs, provider, now, officialAfterMinutes } = input;
  const deferOfficial = input.deferOfficial ?? false;

  const out: BatchOutput = {
    updated: 0,
    changes: [],
    finished: [],
    finishedDetails: [],
    unmatched: [],
    warnings: [],
  };

  const byId = new Map(input.candidates.map((f) => [f.id, f]));
  const byPair = new Map(input.candidates.map((f) => [`${f.homeTeamId}|${f.awayTeamId}`, f]));

  for (const incoming of input.incoming) {
    const home = resolver.resolve(incoming.homeTeam);
    const away = resolver.resolve(incoming.awayTeam);
    if (!home.teamId || !away.teamId) {
      out.unmatched.push(`${incoming.homeTeam.name} – ${incoming.awayTeam.name}`);
      continue;
    }

    const knownId = fixtureRefs.byExternalId.get(incoming.externalId);
    const existing =
      (knownId ? byId.get(knownId) : undefined) ?? byPair.get(`${home.teamId}|${away.teamId}`);
    if (!existing) {
      out.warnings.push(
        `match inconnu au calendrier : ${incoming.homeTeam.name} – ${incoming.awayTeam.name}` +
          " (lancer /api/sync/calendar)",
      );
      continue;
    }

    const plan = planLiveUpdate(existing, incoming, {
      provider,
      now,
      officialAfterMinutes,
      deferOfficial,
    });
    if (Object.keys(plan.patch).length === 0) continue;

    await applyFixturePatch(sb, existing.id, plan.patch);
    out.updated += 1;
    out.changes.push(`${existing.id} · ${plan.reasons.join(" ; ")}`);

    // Un match qui vient de se terminer alimente le flux d'événements : le fil,
    // les badges et les notifications le liront, ils ne le recalculent pas.
    const becameFinal = plan.patch.status === "finished" || plan.patch.status === "official";
    if (becameFinal) {
      out.finished.push(existing.id);
      const hScore = plan.patch.home_score ?? existing.homeScore;
      const aScore = plan.patch.away_score ?? existing.awayScore;
      const debrief = await computeFixtureDebrief(ctx, existing.id, hScore, aScore);
      await emitFixtureFinished(ctx, existing.id, {
        homeTeam: incoming.homeTeam.name,
        awayTeam: incoming.awayTeam.name,
        homeScore: hScore,
        awayScore: aScore,
        status: plan.patch.status,
        provider,
        ...debrief,
      });
      if (hScore !== null && aScore !== null) {
        out.finishedDetails.push({
          fixtureId: existing.id,
          homeTeam: incoming.homeTeam.name,
          awayTeam: incoming.awayTeam.name,
          homeScore: hScore,
          awayScore: aScore,
        });
      }
    }
  }

  return out;
}

/**
 * La répartition des pronostics sur ce match — combien pour chaque camp, et
 * qui avait trouvé le score exact — pour le debrief du Vestiaire (règle n° 8 :
 * on lit ce que le jeu a déjà décidé, on ne le recalcule pas). Un échec ici
 * n'empêche jamais d'écrire l'événement : au pire, le debrief reste sobre.
 */
async function computeFixtureDebrief(
  ctx: SyncContext,
  fixtureId: string,
  homeScore: number | null,
  awayScore: number | null,
): Promise<Record<string, unknown>> {
  const { data } = await ctx.sb
    .from("predictions")
    .select("user_id, outcome, exact_home_score, exact_away_score")
    .eq("fixture_id", fixtureId);
  const rows = (data ?? []) as Array<{
    user_id: string;
    outcome: string;
    exact_home_score: number | null;
    exact_away_score: number | null;
  }>;

  const onHome = rows.filter((r) => r.outcome === "home").length;
  const onAway = rows.filter((r) => r.outcome === "away").length;
  const onDraw = rows.filter((r) => r.outcome === "draw").length;

  let exactNames: string[] = [];
  if (homeScore !== null && awayScore !== null) {
    const exactUserIds = rows
      .filter((r) => r.exact_home_score === homeScore && r.exact_away_score === awayScore)
      .map((r) => r.user_id);
    if (exactUserIds.length > 0) {
      const { data: names } = await ctx.sb
        .from("profiles")
        .select("id, first_name")
        .in("id", exactUserIds);
      exactNames = ((names ?? []) as Array<{ first_name: string }>).map((n) => n.first_name);
    }
  }

  return { onHome, onAway, onDraw, exactNames };
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
  if (error) logger.error("sync.live.event_not_written", { fixtureId, error });
}
