/**
 * Types du domaine — contrat partagé par toute l'application.
 *
 * Toute modification de ce fichier est susceptible de casser le travail des
 * autres chantiers : en discuter avant, ne jamais modifier une signature
 * existante sans prévenir.
 */

export type Uuid = string;

export type MatchOutcome = "home" | "draw" | "away";

export type FixtureStatus =
  | "scheduled"
  | "live"
  | "finished"
  | "official"
  | "postponed"
  | "cancelled";

export type RoundStatus = "upcoming" | "open" | "locked" | "settled";

/** Les quatre niveaux de la cascade de scoring, du pire au meilleur. */
export type ScoreLevel = "wrong" | "winner" | "winner_and_margin" | "exact_score";

export interface Team {
  id: Uuid;
  code: string;
  name: string;
  shortName: string;
  city: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
}

export interface Fixture {
  id: Uuid;
  roundId: Uuid;
  homeTeam: Team;
  awayTeam: Team;
  kickoffAt: string;          // ISO 8601
  kickoffConfirmed: boolean;  // false = horaire provisoire, la LNR n'a pas publié
  locksAt: string;            // ISO 8601
  status: FixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
  minute: number | null;
}

export interface Round {
  id: Uuid;
  number: number;
  name: string;
  status: RoundStatus;
  startsAt: string | null;
  endsAt: string | null;
}

export interface MarginBucket {
  id: Uuid;
  position: number;
  minPoints: number;
  maxPoints: number | null;   // null = borne ouverte (41+)
  label: string;
}

/** Ce qu'un joueur a joué sur un match. */
export interface Prediction {
  id: Uuid;
  userId: Uuid;
  fixtureId: Uuid;
  outcome: MatchOutcome;
  marginBucketId: Uuid | null;
  marginValue: number | null;   // utilisé en mode "distance"
  exactHomeScore: number | null;
  exactAwayScore: number | null;
  isAuto: boolean;              // prono par défaut appliqué au verrouillage
}

/** Le résultat d'un match, tel qu'il entre dans le calcul. */
export interface FixtureResult {
  homeScore: number;
  awayScore: number;
}

/** Le barème, tel qu'il est stocké dans scoring_rulesets.rules. */
export interface Ruleset {
  id: Uuid;
  version: number;
  points: {
    wrong: number;
    winner: number;
    winner_and_margin: number;
    exact_score: number;
  };
  marginMode: "buckets" | "distance";
  marginDistanceTolerance: number;
  exactScore: {
    quota: number | null;       // null = illimité
    period: "match" | "round" | "month" | "season";
    imposedFixtureIds: Uuid[];  // si non vide, seuls ces matchs sont éligibles
  };
  lock: { minutesBeforeKickoff: number };
  defaultPrediction: {
    enabled: boolean;
    outcome: "home" | "median" | "last_choice";
    marginBucket: "median" | string;
  };
  buckets: MarginBucket[];
}

/** Le détail affiché au joueur : « pourquoi j'ai eu 3 points ». */
export interface ScoreBreakdown {
  outcomeCorrect: boolean;
  marginCorrect: boolean;
  exactAttempted: boolean;
  exactCorrect: boolean;
  actualMargin: number | null;
  actualBucketLabel: string | null;
  predictedBucketLabel: string | null;
  /** La tranche a-t-elle été déduite du score exact plutôt que choisie ? */
  marginDerivedFromExact: boolean;
}

export interface ScoreResult {
  points: number;
  level: ScoreLevel;
  breakdown: ScoreBreakdown;
}
