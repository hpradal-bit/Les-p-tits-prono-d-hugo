/**
 * Detection pure des changements de classement.
 *
 * Aucune dependance a `@/` ni a la base : testable avec `node --test`.
 */

export interface StandingsSnapshot {
  userId: string;
  position: number;
  points: number;
}

export interface LeaderChangeNotification {
  newLeaderId: string;
  newLeaderName: string;
  previousLeaderId: string;
}

export interface OvertakeNotification {
  climberId: string;
  climberName: string;
  overtakenId: string;
  overtakenName: string;
  newPosition: number;
}

export function detectStandingsChanges(
  before: StandingsSnapshot[],
  after: StandingsSnapshot[],
  namesById: Map<string, string>,
): {
  leaderChange: LeaderChangeNotification | null;
  overtakes: OvertakeNotification[];
} {
  const posBefore = new Map(before.map((r) => [r.userId, r.position]));
  const posAfter = new Map(after.map((r) => [r.userId, r.position]));

  const leaderBefore = before.find((r) => r.position === 1);
  const leaderAfter = after.find((r) => r.position === 1);

  let leaderChange: LeaderChangeNotification | null = null;
  if (
    leaderBefore &&
    leaderAfter &&
    leaderBefore.userId !== leaderAfter.userId
  ) {
    leaderChange = {
      newLeaderId: leaderAfter.userId,
      newLeaderName: namesById.get(leaderAfter.userId) ?? "Quelqu'un",
      previousLeaderId: leaderBefore.userId,
    };
  }

  const overtakes: OvertakeNotification[] = [];
  for (const row of after) {
    const oldPos = posBefore.get(row.userId);
    if (oldPos === undefined) continue;
    if (row.position >= oldPos) continue;

    for (const other of before) {
      if (other.userId === row.userId) continue;
      const otherNewPos = posAfter.get(other.userId);
      if (otherNewPos === undefined) continue;
      if (other.position < oldPos && otherNewPos >= row.position && otherNewPos > other.position) {
        overtakes.push({
          climberId: row.userId,
          climberName: namesById.get(row.userId) ?? "Quelqu'un",
          overtakenId: other.userId,
          overtakenName: namesById.get(other.userId) ?? "un adversaire",
          newPosition: row.position,
        });
      }
    }
  }

  return { leaderChange, overtakes };
}
