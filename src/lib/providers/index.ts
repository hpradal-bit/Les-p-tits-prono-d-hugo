/**
 * Point d'entrée du chantier « données sportives ».
 *
 * Le reste de l'application importe d'ici, et d'ici seulement : ni `espn.ts`,
 * ni `apisports.ts` ne doivent apparaître ailleurs dans le code. Changer de
 * fournisseur ne doit toucher que ce dossier.
 */

export type {
  DateRange,
  ProviderFixture,
  ProviderResponse,
  ProviderStandingRow,
  ProviderTeam,
  SportsDataProvider,
} from "./types.ts";
export { ProviderError } from "./types.ts";

export { createProviderChain, runWithFallback, describeError } from "./registry.ts";
export type { ProviderChain, ChainOutcome, AttemptLog } from "./registry.ts";

export {
  computeLocksAt,
  evaluateWindow,
  localDateKey,
  weekendAnchor,
  COMPETITION_TIMEZONE,
} from "./schedule.ts";

export { matchTeam, normalizeName, buildAliasIndex } from "./normalize.ts";
export type { TeamCandidate, TeamAliases } from "./normalize.ts";

export { createSyncContext } from "./sync/context.ts";
export type { SyncContext } from "./sync/context.ts";
export { syncCalendar } from "./sync/calendar.ts";
export type { CalendarSyncReport } from "./sync/calendar.ts";
export { syncLive } from "./sync/live.ts";
export type { LiveSyncReport } from "./sync/live.ts";
export { syncStandings } from "./sync/standings.ts";
export type { StandingsSyncReport } from "./sync/standings.ts";
