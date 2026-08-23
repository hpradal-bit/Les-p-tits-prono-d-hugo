/**
 * Le cœur de la synchronisation, écrit comme des fonctions pures : à partir de
 * ce qu'on a en base et de ce que dit le fournisseur, que faut-il changer ?
 *
 * Pur, donc testable sans réseau ni base — ce qui compte, parce qu'une erreur
 * ici décale un verrouillage et laisse pronostiquer un match commencé.
 */

import type { FixtureStatus } from "@/lib/types";
import { computeLocksAt, groupByWeekend, weekendAnchor } from "./schedule.ts";
import type { ProviderFixture } from "./types.ts";

/** Un match tel qu'il est en base, réduit à ce qui sert au rapprochement. */
export interface StoredFixture {
  id: string;
  roundId: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string;
  kickoffConfirmed: boolean;
  locksAt: string;
  status: FixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
  venue: string | null;
  dataSource: string | null;
}

/** Le patch à appliquer, en colonnes de la table `fixtures`. */
export type FixturePatch = Partial<{
  kickoff_at: string;
  kickoff_confirmed: boolean;
  locks_at: string;
  status: FixtureStatus;
  home_score: number | null;
  away_score: number | null;
  minute: number | null;
  venue: string;
  data_source: string;
  last_synced_at: string;
}>;

export interface PlanResult {
  patch: FixturePatch;
  /** Ce qui change, en clair, pour `sync_runs.detail` et le fil d'événements. */
  reasons: string[];
}

export interface CalendarPlanOptions {
  lockMinutes: number;
  provider: string;
  now?: Date;
  /** Un horaire fixé à la main par l'admin n'est pas écrasé. */
  respectManualOverrides?: boolean;
}

/** Deux instants ISO désignent-ils la même minute ? */
function sameInstant(a: string, b: string): boolean {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(ta - tb) < 60_000;
}

/**
 * Confirmation des horaires — la raison d'être de la synchronisation du
 * calendrier.
 *
 * Les 91 matchs de la phase aller ont été créés avec un coup d'envoi provisoire
 * (samedi 15 h, `kickoff_confirmed = false`). Dès que la LNR publie, on
 * remplace l'horaire, on lève le drapeau, **et on recalcule `locks_at`** depuis
 * le délai en vigueur. Oublier ce recalcul, c'est verrouiller au mauvais
 * moment.
 */
export function planCalendarUpdate(
  existing: StoredFixture,
  incoming: ProviderFixture,
  options: CalendarPlanOptions,
): PlanResult {
  const { lockMinutes, provider } = options;
  const respectManual = options.respectManualOverrides ?? true;
  const patch: FixturePatch = {};
  const reasons: string[] = [];

  const adminFixed = respectManual && existing.dataSource === "manual" && existing.kickoffConfirmed;

  if (!adminFixed && incoming.kickoffPrecise) {
    const kickoffMoved = !sameInstant(existing.kickoffAt, incoming.kickoffAt);
    const newlyConfirmed = !existing.kickoffConfirmed;

    if (kickoffMoved) {
      patch.kickoff_at = incoming.kickoffAt;
      reasons.push(
        `coup d'envoi : ${existing.kickoffAt} → ${incoming.kickoffAt}`,
      );
    }
    if (newlyConfirmed) {
      patch.kickoff_confirmed = true;
      reasons.push("horaire confirmé par le fournisseur");
    }

    // Le verrouillage suit toujours le coup d'envoi et le délai en vigueur.
    const expectedLock = computeLocksAt(incoming.kickoffAt, lockMinutes);
    if (kickoffMoved || newlyConfirmed || !sameInstant(existing.locksAt, expectedLock)) {
      if (existing.dataSource !== "manual" || kickoffMoved || newlyConfirmed) {
        patch.locks_at = expectedLock;
        reasons.push(`verrouillage recalculé à ${expectedLock} (J-${lockMinutes} min)`);
      }
    }
  } else if (adminFixed) {
    reasons.push("horaire fixé par l'admin : non modifié");
  } else if (!incoming.kickoffPrecise && !existing.kickoffConfirmed) {
    reasons.push("le fournisseur ne donne pas encore d'horaire précis");
  }

  // Un report ou une annonce d'annulation doit passer, même hors synchro live.
  if (
    (incoming.status === "postponed" || incoming.status === "cancelled") &&
    existing.status !== incoming.status
  ) {
    patch.status = incoming.status;
    reasons.push(`statut : ${existing.status} → ${incoming.status}`);
  }

  if (incoming.venue && !existing.venue) {
    patch.venue = incoming.venue;
    reasons.push(`stade : ${incoming.venue}`);
  }

  if (Object.keys(patch).length > 0) {
    patch.data_source = provider;
    patch.last_synced_at = (options.now ?? new Date()).toISOString();
  }

  return { patch, reasons };
}

export interface LivePlanOptions {
  provider: string;
  now?: Date;
  /** Délai après lequel un score terminé devient officiel (`app_settings`). */
  officialAfterMinutes: number;
}

/** Ordre de fermeté des statuts : on ne redescend jamais. */
const STATUS_RANK: Record<FixtureStatus, number> = {
  scheduled: 0,
  postponed: 0,
  cancelled: 0,
  live: 1,
  finished: 2,
  official: 3,
};

/**
 * Mise à jour d'un score en direct.
 *
 * Deux garde-fous : un match `official` n'est plus touché par la synchro (seul
 * l'admin peut corriger un résultat définitif), et un fournisseur qui « oublie »
 * un score déjà connu ne l'efface pas.
 */
export function planLiveUpdate(
  existing: StoredFixture,
  incoming: ProviderFixture,
  options: LivePlanOptions,
): PlanResult {
  const now = options.now ?? new Date();
  const patch: FixturePatch = {};
  const reasons: string[] = [];

  if (existing.status === "official") {
    return { patch, reasons: ["résultat officiel : intouchable par la synchro"] };
  }

  const scoresKnown = incoming.homeScore !== null && incoming.awayScore !== null;
  if (scoresKnown && (incoming.homeScore !== existing.homeScore || incoming.awayScore !== existing.awayScore)) {
    patch.home_score = incoming.homeScore;
    patch.away_score = incoming.awayScore;
    reasons.push(
      `score : ${existing.homeScore ?? "–"}-${existing.awayScore ?? "–"} → ${incoming.homeScore}-${incoming.awayScore}`,
    );
  }

  if (STATUS_RANK[incoming.status] >= STATUS_RANK[existing.status] && incoming.status !== existing.status) {
    patch.status = incoming.status;
    reasons.push(`statut : ${existing.status} → ${incoming.status}`);
  }

  const minute = incoming.status === "live" ? incoming.minute : null;
  if (minute !== existing.minute) {
    patch.minute = minute;
  }

  // Passage à « officiel » : un score terminé et stable depuis assez longtemps.
  const effectiveStatus = patch.status ?? existing.status;
  if (effectiveStatus === "finished") {
    const kickoff = new Date(existing.kickoffAt).getTime();
    const elapsedMinutes = (now.getTime() - kickoff) / 60_000;
    const scoreStable = !("home_score" in patch);
    if (scoreStable && elapsedMinutes >= options.officialAfterMinutes) {
      patch.status = "official";
      reasons.push(`résultat déclaré officiel (${Math.round(elapsedMinutes)} min après le coup d'envoi)`);
    }
  }

  if (Object.keys(patch).length > 0) {
    patch.data_source = options.provider;
    patch.last_synced_at = now.toISOString();
  }

  return { patch, reasons };
}

// --- Rattachement aux journées ----------------------------------------------

export interface StoredRound {
  id: string;
  number: number;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
}

/**
 * À quelle journée appartient un match ? D'abord la fenêtre déclarée de la
 * journée, sinon le week-end : deux matchs du même week-end sont la même
 * journée.
 */
export function findRoundFor(kickoffAt: string, rounds: StoredRound[]): StoredRound | null {
  const t = new Date(kickoffAt).getTime();
  if (Number.isNaN(t)) return null;

  for (const round of rounds) {
    if (!round.startsAt || !round.endsAt) continue;
    const from = new Date(round.startsAt).getTime();
    const to = new Date(round.endsAt).getTime();
    if (t >= from && t <= to) return round;
  }

  const anchor = weekendAnchor(kickoffAt);
  for (const round of rounds) {
    if (!round.startsAt) continue;
    if (weekendAnchor(round.startsAt) === anchor) return round;
  }
  return null;
}

export interface PlannedRound {
  number: number;
  name: string;
  startsAt: string;
  endsAt: string;
  anchor: string;
}

/**
 * Les journées à créer pour les matchs qui n'en ont pas — c'est ce qui permet
 * d'importer la phase retour (J14 à J26) le jour où la LNR la publie, sans
 * rien saisir à la main.
 */
export function planMissingRounds(
  kickoffs: string[],
  existingRounds: StoredRound[],
  options: { maxRounds: number; namePrefix?: string },
): PlannedRound[] {
  if (kickoffs.length === 0) return [];
  const prefix = options.namePrefix ?? "J";
  const takenAnchors = new Set(
    existingRounds.filter((r) => r.startsAt).map((r) => weekendAnchor(r.startsAt as string)),
  );

  let nextNumber = existingRounds.reduce((max, r) => Math.max(max, r.number), 0) + 1;
  const planned: PlannedRound[] = [];

  for (const group of groupByWeekend(kickoffs, (k) => k)) {
    if (takenAnchors.has(group.anchor)) continue;
    if (nextNumber > options.maxRounds) break; // garde-fou : jamais de J27

    const sorted = [...group.items].sort();
    const first = new Date(sorted[0]);
    const last = new Date(sorted[sorted.length - 1]);
    planned.push({
      number: nextNumber,
      name: `${prefix}${nextNumber}`,
      // On élargit d'une demi-journée de part et d'autre : la fenêtre sert au
      // rattachement des matchs, pas à l'affichage.
      startsAt: new Date(first.getTime() - 12 * 3_600_000).toISOString(),
      endsAt: new Date(last.getTime() + 12 * 3_600_000).toISOString(),
      anchor: group.anchor,
    });
    takenAnchors.add(group.anchor);
    nextNumber += 1;
  }

  return planned;
}
