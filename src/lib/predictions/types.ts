import type { Fixture, MatchOutcome, Round, Ruleset, Uuid } from "@/lib/types";
import type { ExactAttempt, ExactScoreBudget, ExactScoreVerdict } from "./exact-score";

/** Ce que le joueur a saisi sur un match, tel que l'écran le manipule. */
export interface PredictionDraft {
  outcome: MatchOutcome | null;
  marginBucketId: Uuid | null;
  marginValue: number | null;
  exactHomeScore: number | null;
  exactAwayScore: number | null;
}

/** Résultat du scoring sur un pronostic. */
export interface PredictionScore {
  points: number;
  level: string;
}

/** Un match de la journée, prêt à être affiché. */
export interface JourneyFixture {
  fixture: Fixture;
  /** Mon pronostic, s'il existe. Jamais celui des autres avant verrouillage. */
  draft: PredictionDraft | null;
  /** Ce pronostic a-t-il été posé automatiquement au verrouillage ? */
  isAuto: boolean;
  /** Verrouillé selon l'horloge du serveur au moment du rendu. */
  isLocked: boolean;
  /** Le score exact est-il ouvert sur ce match, à l'ouverture de l'écran ? */
  exactScore: ExactScoreVerdict;
  /** Mois du coup d'envoi dans le fuseau du jeu — sert au découpage du quota. */
  monthKey: string;
  /** Points gagnés sur ce match, si le match a un résultat et un prono. */
  score: PredictionScore | null;
}

/** Combien de matchs chacun a joués — sans rien révéler du contenu. */
export interface ParticipationRow {
  userId: Uuid;
  firstName: string;
  displayName: string;
  avatarKind: "emoji" | "photo" | "club";
  avatarValue: string;
  played: number;
  total: number;
  missing: number;
}

/** Résumé d'une journée pour le bandeau de navigation. */
export interface RoundSummary {
  id: Uuid;
  number: number;
  name: string;
  status: string;
}

/**
 * Une journée de la saison, avec ses matchs assemblés — pour l'affichage
 * « Mes pronos » en défilement continu (une section par journée, la journée
 * courante développée, les autres repliées).
 */
export interface SeasonRound {
  round: RoundSummary;
  /** Date du premier coup d'envoi de la journée (ISO), pour le bandeau. */
  firstKickoffAt: string | null;
  /** La journée que `pickCurrentRound` retiendrait pour l'écran classique. */
  isCurrent: boolean;
  fixtures: JourneyFixture[];
}

/** Tout ce dont l'écran « Ma journée » a besoin, en un seul objet. */
export interface JourneyBoard {
  userId: Uuid;
  seasonId: Uuid;
  /** La ligue affichée — chaque ligue a son propre classement et sa propre navigation. */
  leagueId: Uuid;
  competitionName: string;
  competitionLogoUrl: string | null;
  round: Round;
  /** Les journées voisines, pour la navigation. */
  previousRound: { id: Uuid; number: number; name: string } | null;
  nextRound: { id: Uuid; number: number; name: string } | null;
  /** Toutes les journées de la saison, pour le bandeau de navigation. */
  allRounds: RoundSummary[];
  fixtures: JourneyFixture[];
  /**
   * Toute la saison, journée par journée, matchs assemblés — pour la vue
   * « Mes pronos » en défilement continu. Vide si la saison n'a aucune
   * journée (ne devrait pas arriver, `loadJourneyBoard` renvoie `null` avant).
   */
  seasonRounds: SeasonRound[];
  /** Tous les scores exacts déjà tentés sur la saison, quelle que soit la journée. */
  allAttempts: ExactAttempt[];
  /** Le barème en vigueur : tranches, quotas, points. Rien n'est en dur à l'écran. */
  ruleset: Ruleset;
  /** Budget de scores exacts sur la période en cours. */
  exactScoreBudget: ExactScoreBudget;
  /**
   * Les scores exacts déjà tentés HORS de cette journée. L'écran y ajoute ceux
   * de la journée en cours pour recalculer le quota à chaque frappe, sans
   * repasser par le serveur.
   */
  otherAttempts: ExactAttempt[];
  /** Combien de matchs il me reste à jouer, parmi ceux encore ouverts. */
  remainingToPlay: number;
  /** Nombre de matchs encore ouverts à la saisie. */
  openCount: number;
  /** Prochain verrouillage de la journée, ISO 8601, ou null si tout est fermé. */
  nextLockAt: string | null;
  /** Au moins un horaire n'est pas encore confirmé par la LNR. */
  hasProvisionalKickoffs: boolean;
  participation: ParticipationRow[];
  timeZone: string;
  /** Horloge du serveur au moment du rendu, ISO 8601. */
  serverNow: string;
}
