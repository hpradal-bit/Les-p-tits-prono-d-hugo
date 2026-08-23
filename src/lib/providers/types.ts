/**
 * L'interface unique par laquelle l'application voit les données sportives.
 *
 * Règle non négociable n°5 : aucune dépendance directe à un fournisseur ailleurs
 * dans le code. Personne n'importe `espn.ts` ou `apisports.ts` en dehors de
 * `src/lib/providers/` — on passe par `SportsDataProvider`.
 *
 * Corollaire : aucun identifiant externe (ligue ESPN `270559`, identifiant
 * d'équipe API-Sports…) n'est écrit en dur ailleurs. Ils vivent dans
 * `external_refs`, et sont passés en paramètre aux implémentations.
 */

import type { FixtureStatus } from "@/lib/types";

/** Intervalle de dates inclusif, en jours calendaires (`YYYY-MM-DD`). */
export interface DateRange {
  from: string;
  to: string;
}

/** Un match, tel qu'un fournisseur nous le décrit — avant tout rapprochement. */
export interface ProviderFixture {
  /** Identifiant du match chez ce fournisseur. Sert à alimenter `external_refs`. */
  externalId: string;
  /** Coup d'envoi réel annoncé par le fournisseur, en ISO 8601 UTC. */
  kickoffAt: string;
  /**
   * Le fournisseur annonce-t-il un horaire réel (et non une date par défaut) ?
   * Seul un horaire réel autorise `kickoff_confirmed = true`.
   */
  kickoffPrecise: boolean;
  status: FixtureStatus;
  homeTeam: ProviderTeam;
  awayTeam: ProviderTeam;
  homeScore: number | null;
  awayScore: number | null;
  /** Minute de jeu si le match est en cours, sinon null. */
  minute: number | null;
  venue: string | null;
  /** Libellé de journée si le fournisseur en donne un (« Round 14 »…). */
  roundLabel: string | null;
}

export interface ProviderTeam {
  /** Identifiant de l'équipe chez ce fournisseur, si disponible. */
  externalId: string | null;
  /** Nom le plus complet dont on dispose : c'est lui qu'on normalise. */
  name: string;
  /** Autres graphies proposées par le fournisseur (nom court, abréviation, ville). */
  aliases: string[];
}

/** Une ligne du classement sportif réel de la compétition. */
export interface ProviderStandingRow {
  team: ProviderTeam;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  bonusOffensive: number;
  bonusDefensive: number;
  points: number;
}

/** Ce que renvoie un appel de fournisseur : la donnée et son coût en requêtes. */
export interface ProviderResponse<T> {
  provider: string;
  data: T;
  /** Nombre de requêtes HTTP réellement consommées (quota API-Sports). */
  requestsUsed: number;
  /** Ce que le fournisseur n'a pas su donner, sans que ce soit un échec. */
  warnings: string[];
}

/**
 * Le contrat. Trois lectures, jamais d'écriture : un fournisseur ne connaît ni
 * notre base, ni nos identifiants.
 */
export interface SportsDataProvider {
  /** `espn`, `apisports`… — sert de clé dans `external_refs` et `sync_runs`. */
  readonly name: string;
  /** Quota journalier connu du fournisseur, ou null s'il n'y en a pas. */
  readonly dailyQuota: number | null;

  /** Le calendrier d'une saison sur une plage de dates. */
  getFixtures(
    seasonExternalId: string,
    range: DateRange,
  ): Promise<ProviderResponse<ProviderFixture[]>>;

  /** Les matchs d'une journée donnée, scores en direct compris (`YYYY-MM-DD`). */
  getLiveScores(
    seasonExternalId: string,
    date: string,
  ): Promise<ProviderResponse<ProviderFixture[]>>;

  /** Le classement sportif réel de la compétition. */
  getStandings(
    seasonExternalId: string,
  ): Promise<ProviderResponse<ProviderStandingRow[]>>;
}

/** Erreur d'un fournisseur : réseau, quota, format inattendu. */
export class ProviderError extends Error {
  readonly provider: string;
  readonly reason: unknown;

  constructor(provider: string, message: string, reason?: unknown) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderError";
    this.provider = provider;
    this.reason = reason;
  }
}
