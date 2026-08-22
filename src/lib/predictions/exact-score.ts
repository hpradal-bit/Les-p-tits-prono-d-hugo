import type { Ruleset, Uuid } from "@/lib/types";

/**
 * Le moteur de quota de scores exacts — fonction pure.
 *
 * Les six modes du cahier des charges ne sont pas six mécanismes : c'en est un
 * seul, réglé différemment. Tout est lu dans `ruleset.exactScore`, rien n'est
 * en dur ici.
 *
 *   désactivé        → quota 0
 *   un par journée   → quota 1, period 'round'      ← le réglage de départ
 *   match imposé     → quota 1 + imposedFixtureIds
 *   N par journée    → quota N
 *   partout          → quota null (illimité)
 *
 * ⚠️ Ce module décide de ce que l'écran propose. Il ne décide de rien d'autre :
 * la base applique la même règle à l'écriture (fonction `exact_score_state`,
 * migration 0011). Les deux implémentations doivent rester alignées.
 */

export type ExactScorePeriod = Ruleset["exactScore"]["period"];

/** Une tentative de score exact déjà enregistrée par le joueur. */
export interface ExactAttempt {
  fixtureId: Uuid;
  roundId: Uuid;
  seasonId: Uuid;
  /** Mois du coup d'envoi dans le fuseau du jeu, au format « 2026-09 ». */
  monthKey: string;
}

/** Le match que le joueur regarde, dans son contexte de période. */
export interface ExactScopeFixture {
  fixtureId: Uuid;
  roundId: Uuid;
  seasonId: Uuid;
  monthKey: string;
}

export interface ExactScoreBudget {
  quota: number | null;
  period: ExactScorePeriod;
  /** true quand le quota est nul côté barème : score exact sans limite. */
  unlimited: boolean;
  /** true quand le quota vaut 0 : le score exact est désactivé. */
  disabled: boolean;
  used: number;
  /** null quand c'est illimité. */
  remaining: number | null;
}

export interface ExactScoreVerdict extends ExactScoreBudget {
  /** Le match fait-il partie des matchs autorisés par l'admin ? */
  eligible: boolean;
  /** Le joueur peut-il tenter (ou conserver) un score exact sur ce match ? */
  allowed: boolean;
}

/** Le mois d'un coup d'envoi dans le fuseau du jeu. « 2026-09 ». */
export function monthKeyOf(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone,
  }).formatToParts(new Date(iso));
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  return `${year}-${month}`;
}

/** Le match est-il dans la liste des matchs imposés (si l'admin en a fixé une) ? */
export function isFixtureEligible(ruleset: Ruleset, fixtureId: Uuid): boolean {
  const imposed = ruleset.exactScore.imposedFixtureIds;
  return imposed.length === 0 || imposed.includes(fixtureId);
}

/** Les tentatives qui comptent dans la même période que le match visé. */
function attemptsInPeriod(
  period: ExactScorePeriod,
  attempts: readonly ExactAttempt[],
  scope: ExactScopeFixture,
): ExactAttempt[] {
  switch (period) {
    case "match":
      // Un quota par match : rien à compter ailleurs, la clé unique
      // (joueur, match) fait déjà le travail.
      return attempts.filter((a) => a.fixtureId === scope.fixtureId);
    case "month":
      return attempts.filter(
        (a) => a.seasonId === scope.seasonId && a.monthKey === scope.monthKey,
      );
    case "season":
      return attempts.filter((a) => a.seasonId === scope.seasonId);
    case "round":
    default:
      return attempts.filter((a) => a.roundId === scope.roundId);
  }
}

/**
 * Le budget de la période : combien de scores exacts sont consommés, combien
 * il en reste. C'est ce que l'écran affiche en en-tête.
 */
export function exactScoreBudget(
  ruleset: Ruleset,
  attempts: readonly ExactAttempt[],
  scope: ExactScopeFixture,
): ExactScoreBudget {
  const { quota, period } = ruleset.exactScore;
  const used = attemptsInPeriod(period, attempts, scope).length;

  return {
    quota,
    period,
    unlimited: quota === null,
    disabled: quota === 0,
    used,
    remaining: quota === null ? null : Math.max(quota - used, 0),
  };
}

/**
 * Peut-on tenter un score exact sur CE match ?
 *
 * La tentative déjà posée sur ce même match ne se compte pas contre elle-même :
 * corriger un score exact déjà saisi doit toujours rester possible.
 */
export function exactScoreVerdict(
  ruleset: Ruleset,
  attempts: readonly ExactAttempt[],
  scope: ExactScopeFixture,
): ExactScoreVerdict {
  const budget = exactScoreBudget(ruleset, attempts, scope);
  const eligible = isFixtureEligible(ruleset, scope.fixtureId);

  const others = attemptsInPeriod(budget.period, attempts, scope).filter(
    (a) => a.fixtureId !== scope.fixtureId,
  ).length;

  const withinQuota = budget.quota === null || others < budget.quota;

  return { ...budget, eligible, allowed: eligible && withinQuota };
}

/** « il te reste 1 score exact » / « score exact illimité » / « désactivé ». */
export function exactScoreSentence(budget: ExactScoreBudget): string {
  if (budget.disabled) return "Score exact désactivé";
  if (budget.unlimited) return "Score exact sur tous les matchs";

  const n = budget.remaining ?? 0;
  const scope = PERIOD_LABEL[budget.period];
  if (n === 0) return `Score exact épuisé ${scope}`;
  const s = n > 1 ? "s" : "";
  return `${n} score${s} exact${s} restant${s} ${scope}`;
}

export const PERIOD_LABEL: Record<ExactScorePeriod, string> = {
  match: "par match",
  round: "cette journée",
  month: "ce mois-ci",
  season: "cette saison",
};
