import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueue } from "./notify.ts";
import { dedupeKey } from "./schedule.ts";
import {
  detectStandingsChanges,
  type StandingsSnapshot,
} from "./standings-detect.ts";

export type { StandingsSnapshot } from "./standings-detect.ts";

export async function emitAndNotifyStandingsChanges(
  admin: SupabaseClient,
  seasonId: string,
  leagueId: string,
  before: StandingsSnapshot[],
  after: StandingsSnapshot[],
  namesById: Map<string, string>,
): Promise<{ leaderNotifs: number; overtakeNotifs: number }> {
  const { leaderChange, overtakes } = detectStandingsChanges(
    before,
    after,
    namesById,
  );

  let leaderNotifs = 0;
  let overtakeNotifs = 0;

  if (leaderChange) {
    await admin.from("events").insert({
      kind: "leader_change",
      season_id: seasonId,
      actor_id: leaderChange.newLeaderId,
      payload: { previous_leader_id: leaderChange.previousLeaderId },
    });

    // Les membres de CETTE ligue, jamais `group_members` (table historique,
    // globale à l'appli) : un compte de test ou le membre d'une autre ligue
    // n'a pas à recevoir une notification sur un classement qui n'est pas
    // le sien.
    const { data: members } = await admin
      .from("league_members")
      .select("user_id")
      .eq("league_id", leagueId);

    for (const member of members ?? []) {
      const userId = member.user_id as string;
      const outcome = await enqueue(admin, {
        userId,
        kind: "leader_change",
        title: `👑 ${leaderChange.newLeaderName} prend la tête !`,
        body: `${leaderChange.newLeaderName} est le nouveau leader du classement.`,
        url: "/classement",
        dedupeKey: dedupeKey("leader_change", leaderChange.newLeaderId),
      });
      if (outcome === "queued") leaderNotifs += 1;
    }
  }

  for (const ov of overtakes) {
    await admin.from("events").insert({
      kind: "overtake",
      season_id: seasonId,
      actor_id: ov.climberId,
      target_id: ov.overtakenId,
      payload: { new_position: ov.newPosition },
    });

    const outcome = await enqueue(admin, {
      userId: ov.overtakenId,
      kind: "overtake",
      title: `🔥 ${ov.climberName} vient de te doubler`,
      body: `${ov.climberName} passe ${ov.newPosition}${ov.newPosition === 1 ? "er" : "e"} au classement.`,
      url: "/classement",
      dedupeKey: dedupeKey("overtake", `${ov.climberId}:${ov.overtakenId}`),
    });
    if (outcome === "queued") overtakeNotifs += 1;
  }

  return { leaderNotifs, overtakeNotifs };
}
