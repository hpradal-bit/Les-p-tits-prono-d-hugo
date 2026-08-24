import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueue } from "./notify.ts";
import { dedupeKey } from "./schedule.ts";

/**
 * Notifications liées aux résultats — le samedi soir du joueur.
 *
 * Deux types :
 *   · `exact_score` — quand quelqu'un décroche un score exact (rare et spectaculaire)
 *   · `fixture_result` — quand un match se termine, chaque joueur reçoit le résultat
 *
 * Appelées depuis la route `/api/sync/live`, après le calcul des points.
 * Une notification ratée n'empêche pas le score d'être écrit.
 */

export interface ExactScoreNotification {
  fixtureId: string;
  scorerId: string;
  scorerName: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

export async function queueExactScoreNotifications(
  admin: SupabaseClient,
  notifications: ExactScoreNotification[],
): Promise<number> {
  if (notifications.length === 0) return 0;

  const { data: members } = await admin
    .from("group_members")
    .select("user_id");

  let queued = 0;
  for (const n of notifications) {
    for (const member of members ?? []) {
      const userId = member.user_id as string;
      const outcome = await enqueue(admin, {
        userId,
        kind: "exact_score",
        title: `🎯 Score exact de ${n.scorerName} !`,
        body: `${n.scorerName} a trouvé le ${n.homeScore}-${n.awayScore} sur ${n.homeTeam} – ${n.awayTeam}. +10 points.`,
        url: "/vestiaire",
        dedupeKey: dedupeKey("exact_score", `${n.fixtureId}:${n.scorerId}`),
      });
      if (outcome === "queued") queued += 1;
    }
  }
  return queued;
}

export interface FixtureResultNotification {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

export async function queueFixtureResultNotifications(
  admin: SupabaseClient,
  fixtures: FixtureResultNotification[],
): Promise<number> {
  if (fixtures.length === 0) return 0;

  const { data: members } = await admin
    .from("group_members")
    .select("user_id");

  let queued = 0;
  for (const f of fixtures) {
    const score = `${f.homeScore}-${f.awayScore}`;
    for (const member of members ?? []) {
      const userId = member.user_id as string;
      const outcome = await enqueue(admin, {
        userId,
        kind: "fixture_result",
        title: `🏉 ${f.homeTeam} ${score} ${f.awayTeam}`,
        body: "Résultat final. Va voir tes points.",
        url: "/journee",
        dedupeKey: dedupeKey("fixture_result", f.fixtureId),
      });
      if (outcome === "queued") queued += 1;
    }
  }
  return queued;
}

/**
 * Lit les événements `exact_score` fraîchement écrits et les traduit en
 * notifications. La règle n° 8 veut que les notifications lisent le flux
 * d'événements plutôt que de recalculer la logique.
 */
export async function loadExactScoreNotifications(
  admin: SupabaseClient,
  fixtureIds: string[],
  details: FixtureResultNotification[],
): Promise<ExactScoreNotification[]> {
  if (fixtureIds.length === 0) return [];

  const { data: events } = await admin
    .from("events")
    .select("fixture_id, actor_id, payload")
    .eq("kind", "exact_score")
    .in("fixture_id", fixtureIds);
  if (!events || events.length === 0) return [];

  const actorIds = [...new Set(events.map((e) => e.actor_id as string))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name")
    .in("id", actorIds);

  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.first_name as string]));
  const detailsById = new Map(details.map((d) => [d.fixtureId, d]));

  return events
    .map((e) => {
      const d = detailsById.get(e.fixture_id as string);
      if (!d) return null;
      return {
        fixtureId: e.fixture_id as string,
        scorerId: e.actor_id as string,
        scorerName: nameById.get(e.actor_id as string) ?? "Quelqu'un",
        homeTeam: d.homeTeam,
        awayTeam: d.awayTeam,
        homeScore: d.homeScore,
        awayScore: d.awayScore,
      };
    })
    .filter((n): n is ExactScoreNotification => n !== null);
}
