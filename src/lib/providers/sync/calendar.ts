/**
 * Synchronisation du calendrier.
 *
 * Ce qu'elle fait, par ordre d'importance :
 *   1. **confirmer les horaires** — remplacer le coup d'envoi provisoire,
 *      passer `kickoff_confirmed = true` et recalculer `locks_at` ;
 *   2. importer les matchs qu'on n'a pas encore, phase retour comprise (J14 à
 *      J26), en créant les journées manquantes ;
 *   3. mémoriser les correspondances d'identifiants dans `external_refs`.
 *
 * Elle ne touche ni aux scores ni aux points.
 */

// Chemin relatif : le lanceur de tests ne résout pas « @/ » pour les valeurs.
import { setting } from "../../settings/index.ts";
import { computeLocksAt } from "../schedule.ts";
import {
  findRoundFor,
  planCalendarUpdate,
  planMissingRounds,
  type StoredFixture,
  type StoredRound,
} from "../reconcile.ts";
import { TeamResolver, loadRefs, loadSeasonExternalId, upsertRef } from "../refs.ts";
import { describeError, runWithFallback } from "../registry.ts";
import { ProviderError, type DateRange, type ProviderFixture } from "../types.ts";
import type { SyncContext } from "./context.ts";
import {
  applyFixturePatch,
  insertFixtures,
  insertRounds,
  loadSeasonFixtures,
  loadSeasonRounds,
  type NewFixture,
} from "./fixtures-repo.ts";
import { closeRun, openRun, recordProviderUsage, type SyncRunResult } from "./runs.ts";
import { bootstrapSeasonTeams } from "./teams-repo.ts";

export interface CalendarSyncOptions {
  /** Plage à interroger. Par défaut : toute la saison. */
  range?: DateRange;
  /** Simulation : on calcule tout, on n'écrit rien. */
  dryRun?: boolean;
}

export interface CalendarSyncReport {
  status: SyncRunResult["status"];
  provider: string;
  requestsUsed: number;
  fixturesReceived: number;
  kickoffsConfirmed: number;
  fixturesUpdated: number;
  fixturesCreated: number;
  roundsCreated: number;
  /** Équipes créées à l'amorçage d'une compétition nouvelle. */
  teamsCreated: string[];
  unmatched: string[];
  changes: string[];
  warnings: string[];
  error?: string;
}

/** Une clé stable pour reconnaître un match sans dépendre d'un fournisseur. */
function pairKey(homeTeamId: string, awayTeamId: string): string {
  return `${homeTeamId}|${awayTeamId}`;
}

function defaultRange(ctx: SyncContext): DateRange {
  const from = ctx.season.startsOn;
  const to =
    ctx.season.endsOn ??
    new Date(new Date(from).getTime() + 400 * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

export async function syncCalendar(
  ctx: SyncContext,
  options: CalendarSyncOptions = {},
): Promise<CalendarSyncReport> {
  const { sb } = ctx;
  const range = options.range ?? defaultRange(ctx);
  const run = await openRun(sb, "calendar");

  const outcome = await runWithFallback(ctx.chainFor("calendar"), async (provider) => {
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
    return provider.getFixtures(externalId, range);
  });

  const requestsUsed = Object.values(outcome.requestsByProvider).reduce((a, b) => a + b, 0);
  await recordProviderUsage(sb, "calendar", outcome.attempts, outcome.requestsByProvider);

  // Échec des deux fournisseurs : on garde la dernière donnée connue.
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
      detail: { attempts: outcome.attempts, range },
    });
    return {
      status: "failed",
      provider: "chain",
      requestsUsed,
      fixturesReceived: 0,
      kickoffsConfirmed: 0,
      fixturesUpdated: 0,
      fixturesCreated: 0,
      roundsCreated: 0,
      teamsCreated: [],
      unmatched: [],
      changes: [],
      warnings: ["aucun fournisseur joignable : le calendrier connu est conservé"],
      error,
    };
  }

  const provider = outcome.response.provider;
  const incoming = outcome.response.data;
  const warnings = [...outcome.response.warnings];
  const unmatched: string[] = [];
  const changes: string[] = [];

  // Une saison sans aucune équipe est une compétition qu'on vient d'ajouter :
  // il n'y a rien à rapprocher, donc rien à dupliquer. C'est le seul cas où
  // l'on crée l'effectif depuis le fournisseur, plutôt que d'échouer sur seize
  // « équipe non rapprochée » et d'exiger une saisie manuelle.
  let teams = ctx.teams;
  const teamsCreated: string[] = [];
  if (teams.length === 0 && incoming.length > 0) {
    const seeded = await bootstrapSeasonTeams(
      sb, ctx.season.id, ctx.season.competitionId, provider, incoming,
    );
    if (seeded.created > 0) {
      teamsCreated.push(...seeded.names);
      teams = seeded.teams;
      warnings.push(
        `${seeded.created} équipes créées à l'amorçage — vérifier leurs codes dans l'espace admin`,
      );
    }
  }

  const [existingFixtures, rounds, resolver, fixtureRefs] = await Promise.all([
    loadSeasonFixtures(sb, ctx.season.id),
    loadSeasonRounds(sb, ctx.season.id),
    TeamResolver.create(sb, provider, teams, ctx.aliases),
    loadRefs(sb, provider, "fixture"),
  ]);

  const byId = new Map(existingFixtures.map((f) => [f.id, f]));
  const byPair = new Map(existingFixtures.map((f) => [pairKey(f.homeTeamId, f.awayTeamId), f]));

  const respectManual = setting(ctx.settings, "sync.respect_manual_overrides", true);
  const maxRounds = setting(ctx.settings, "sync.season_round_count", 26);
  const autoCreateRounds = setting(ctx.settings, "sync.calendar_auto_create_rounds", true);

  let kickoffsConfirmed = 0;
  let fixturesUpdated = 0;
  let roundsCreated = 0;

  /** Matchs inconnus en base : candidats à la création (phase retour). */
  const toCreate: { incoming: ProviderFixture; homeTeamId: string; awayTeamId: string }[] = [];
  /** Correspondances de match à écrire une fois tout validé. */
  const fixtureRefsToWrite: { fixtureId: string; externalId: string }[] = [];

  for (const fixture of incoming) {
    const home = resolver.resolve(fixture.homeTeam);
    const away = resolver.resolve(fixture.awayTeam);
    if (!home.teamId || !away.teamId) {
      unmatched.push(
        `${fixture.homeTeam.name} – ${fixture.awayTeam.name} : ${!home.teamId ? home.note : away.note}`,
      );
      continue;
    }

    const knownId = fixtureRefs.byExternalId.get(fixture.externalId);
    const existing: StoredFixture | undefined =
      (knownId ? byId.get(knownId) : undefined) ?? byPair.get(pairKey(home.teamId, away.teamId));

    if (!existing) {
      toCreate.push({ incoming: fixture, homeTeamId: home.teamId, awayTeamId: away.teamId });
      continue;
    }

    if (!knownId) {
      fixtureRefsToWrite.push({ fixtureId: existing.id, externalId: fixture.externalId });
    }

    const plan = planCalendarUpdate(existing, fixture, {
      lockMinutes: ctx.lockMinutes,
      provider,
      respectManualOverrides: respectManual,
    });

    if (Object.keys(plan.patch).length === 0) continue;
    if (plan.patch.kickoff_confirmed === true) kickoffsConfirmed += 1;
    changes.push(`${existing.id} · ${plan.reasons.join(" ; ")}`);

    if (!options.dryRun) await applyFixturePatch(sb, existing.id, plan.patch);
    fixturesUpdated += 1;
  }

  // --- Phase retour : créer les journées puis les matchs manquants ----------
  let fixturesCreated = 0;
  if (toCreate.length > 0) {
    let allRounds: StoredRound[] = rounds;

    if (autoCreateRounds) {
      const orphans = toCreate
        .filter((c) => findRoundFor(c.incoming.kickoffAt, allRounds) === null)
        .map((c) => c.incoming.kickoffAt);

      const planned = planMissingRounds(orphans, allRounds, { maxRounds });
      if (planned.length > 0 && !options.dryRun) {
        const created = await insertRounds(
          sb,
          planned.map((p) => ({
            season_id: ctx.season.id,
            number: p.number,
            name: p.name,
            starts_at: p.startsAt,
            ends_at: p.endsAt,
          })),
        );
        allRounds = [...allRounds, ...created];
        roundsCreated = created.length;
        changes.push(`journées créées : ${created.map((r) => r.name).join(", ")}`);
      } else if (planned.length > 0) {
        roundsCreated = planned.length;
        changes.push(`journées à créer : ${planned.map((p) => p.name).join(", ")}`);
      }
    }

    const rows: NewFixture[] = [];
    const rowKeys: { key: string; externalId: string }[] = [];

    for (const candidate of toCreate) {
      const round = findRoundFor(candidate.incoming.kickoffAt, allRounds);
      if (!round) {
        warnings.push(
          `match ${candidate.incoming.homeTeam.name} – ${candidate.incoming.awayTeam.name} ` +
            `sans journée de rattachement (${candidate.incoming.kickoffAt}) : ignoré`,
        );
        continue;
      }
      rows.push({
        round_id: round.id,
        home_team_id: candidate.homeTeamId,
        away_team_id: candidate.awayTeamId,
        kickoff_at: candidate.incoming.kickoffAt,
        kickoff_confirmed: candidate.incoming.kickoffPrecise,
        locks_at: computeLocksAt(candidate.incoming.kickoffAt, ctx.lockMinutes),
        status: candidate.incoming.status === "cancelled" ? "cancelled" : "scheduled",
        venue: candidate.incoming.venue,
        data_source: provider,
      });
      rowKeys.push({
        key: pairKey(candidate.homeTeamId, candidate.awayTeamId),
        externalId: candidate.incoming.externalId,
      });
      if (candidate.incoming.kickoffPrecise) kickoffsConfirmed += 1;
    }

    if (!options.dryRun && rows.length > 0) {
      const inserted = await insertFixtures(sb, rows);
      fixturesCreated = inserted.length;
      for (const row of inserted) {
        const match = rowKeys.find(
          (k) => k.key === pairKey(row.home_team_id, row.away_team_id),
        );
        if (match) fixtureRefsToWrite.push({ fixtureId: row.id, externalId: match.externalId });
      }
      changes.push(`${inserted.length} match(s) importé(s)`);
    } else {
      fixturesCreated = rows.length;
    }
  }

  // --- Mémorisation des correspondances -------------------------------------
  if (!options.dryRun) {
    await resolver.flush(sb);
    for (const ref of fixtureRefsToWrite) {
      try {
        await upsertRef(sb, {
          provider,
          entity_type: "fixture",
          entity_id: ref.fixtureId,
          external_id: ref.externalId,
        });
      } catch (error) {
        warnings.push(`correspondance de match non écrite : ${describeError(error)}`);
      }
    }
  }

  const status: SyncRunResult["status"] = unmatched.length > 0 ? "partial" : "success";
  await closeRun(sb, run, {
    status,
    provider,
    requestsUsed,
    fixturesUpdated: fixturesUpdated + fixturesCreated,
    error: unmatched.length > 0 ? `équipes non rapprochées : ${unmatched.length}` : null,
    detail: {
      range,
      dryRun: options.dryRun ?? false,
      received: incoming.length,
      kickoffsConfirmed,
      roundsCreated,
      teamsCreated,
      unmatched,
      changes: changes.slice(0, 50),
      warnings,
      attempts: outcome.attempts,
    },
  });

  return {
    status,
    provider,
    requestsUsed,
    fixturesReceived: incoming.length,
    kickoffsConfirmed,
    fixturesUpdated,
    fixturesCreated,
    roundsCreated,
    teamsCreated,
    unmatched,
    changes,
    warnings,
  };
}
