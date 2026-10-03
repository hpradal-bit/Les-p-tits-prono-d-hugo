/**
 * Le « match en direct » d'un Duel — combien chaque joueur a marqué sur la
 * journée que couvre le Duel, combien de matchs restent à jouer, qui mène.
 *
 * `computeDuelBattle` est une fonction pure, volontairement calquée sur
 * `duel.ts#resolve` : à la clôture de la journée, `resolve` compare
 * `ctx.roundTotals.get(initiatorId)` à `ctx.roundTotals.get(targetId)` — deux
 * sommes venues de `loadRoundTotals` (`prediction_scores` des matchs
 * `official`, PLUS tout ajustement `power:*` de la journée — bonus Oracle,
 * pénalité Sabotage — à l'exclusion des ajustements `power:duel` eux-mêmes ;
 * voir le commentaire de `loadRoundTotals`, `queries.ts`). Tant que la
 * journée tourne, cette fonction ajoute PAR-DESSUS les mêmes totaux officiels
 * un aperçu en direct
 * (`computeLivePreview`, déjà utilisé par le Match Center et le classement
 * live) pour les matchs `live`/`halftime` pas encore notés — jamais l'inverse.
 * Résultat : une fois le dernier match officialisé, cette fonction et
 * `duel.ts#resolve` tombent EXACTEMENT sur le même nombre, par construction
 * (zéro aperçu restant, mêmes totaux officiels) — voir `battle.test.ts`.
 */

import type { FixtureStatus, Uuid } from "@/lib/types";

export interface BattleFixtureInput {
  id: Uuid;
  status: FixtureStatus;
}

export interface BattleLiveContribution {
  userId: Uuid;
  fixtureId: Uuid;
  points: number;
}

export interface DuelBattle {
  initiatorId: Uuid;
  targetId: Uuid;
  /** Points officiels + aperçu en direct, pour chacun des deux joueurs. */
  initiatorPoints: number;
  targetPoints: number;
  totalFixtures: number;
  playedFixtures: number;
  /** Ni `official` ni `finished` : en cours ou pas encore commencé. */
  remainingFixtures: number;
  tie: boolean;
  /** `null` à égalité. */
  leaderId: Uuid | null;
}

const FINAL_STATUSES: ReadonlySet<FixtureStatus> = new Set(["official", "finished"]);

export function computeDuelBattle(input: {
  initiatorId: Uuid;
  targetId: Uuid;
  fixtures: BattleFixtureInput[];
  /** Mêmes totaux que `resolve.ts` à la clôture — `loadRoundTotals`. */
  officialPoints: Map<Uuid, number>;
  /** Aperçu en direct par (joueur, match), pour les matchs pas encore notés. */
  liveContributions: BattleLiveContribution[];
}): DuelBattle {
  const livePoints = new Map<Uuid, number>();
  for (const c of input.liveContributions) {
    if (c.userId !== input.initiatorId && c.userId !== input.targetId) continue;
    livePoints.set(c.userId, (livePoints.get(c.userId) ?? 0) + c.points);
  }

  const initiatorPoints =
    (input.officialPoints.get(input.initiatorId) ?? 0) + (livePoints.get(input.initiatorId) ?? 0);
  const targetPoints =
    (input.officialPoints.get(input.targetId) ?? 0) + (livePoints.get(input.targetId) ?? 0);

  const totalFixtures = input.fixtures.length;
  const remainingFixtures = input.fixtures.filter((f) => !FINAL_STATUSES.has(f.status)).length;
  const playedFixtures = totalFixtures - remainingFixtures;

  const tie = initiatorPoints === targetPoints;
  const leaderId = tie ? null : initiatorPoints > targetPoints ? input.initiatorId : input.targetId;

  return {
    initiatorId: input.initiatorId,
    targetId: input.targetId,
    initiatorPoints,
    targetPoints,
    totalFixtures,
    playedFixtures,
    remainingFixtures,
    tie,
    leaderId,
  };
}
