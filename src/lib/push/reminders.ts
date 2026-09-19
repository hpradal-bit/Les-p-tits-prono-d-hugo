import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSettings, setting } from "@/lib/settings";
import { resolveLeagueForSeason } from "@/lib/leagues/queries.ts";
import { enqueue } from "./notify";
import { dedupeKey, dayKey } from "./schedule";
import {
  readLockReminderSlots,
  renderReminderText,
  reminderTargetSendTime,
  type ReminderSlot,
} from "./lock-reminder-settings.ts";

/**
 * Les deux notifications de cette livraison.
 *
 * Toutes deux passent par une clé de regroupement : sept matchs d'une même
 * journée ne produisent qu'un seul message, et le planificateur peut repasser
 * toutes les cinq minutes sans jamais doubler quoi que ce soit.
 */

export interface ReminderSummary {
  reminders: number;
  digests: number;
}

/**
 * « Encore 24 h avant la fermeture ! » puis « Dernière ligne droite ! »
 *
 * Deux créneaux, réglés depuis l'espace admin (délai — ou heure précise — et
 * texte de chacun), appliqués automatiquement à chaque match — l'admin les
 * enregistre une fois, plus rien à reprogrammer ensuite. Envoyé à TOUS les
 * membres de la ligue concernée, y compris ceux qui ont déjà joué tous leurs
 * pronostics — demande explicite d'Hugo : ce n'est plus réservé à ceux à qui
 * il manque quelque chose.
 */
export async function queueLockReminders(admin: SupabaseClient): Promise<number> {
  const settings = await loadSettings(admin);
  const timeZone = setting<string>(settings, "notifications.timezone", "Europe/Paris");
  const slots = readLockReminderSlots(settings).filter((s) => s.enabled);
  if (slots.length === 0) return 0;

  // Un seul aller-retour pour tous les matchs pas encore verrouillés : à
  // l'échelle de cette application (91 matchs par saison), pas besoin de
  // filtrer davantage en base — chaque créneau calcule ensuite lui-même,
  // match par match, si son instant d'envoi est atteint.
  const now = new Date();
  const { data: fixtures } = await admin
    .from("fixtures")
    .select("id, round_id, locks_at")
    .gt("locks_at", now.toISOString());
  if (!fixtures || fixtures.length === 0) return 0;

  let queued = 0;
  for (const slot of slots) {
    const due = fixtures.filter(
      (f) => reminderTargetSendTime(slot, new Date(f.locks_at as string), timeZone) <= now,
    );
    queued += await queueRemindersForSlot(admin, slot, due, timeZone, now);
  }
  return queued;
}

async function queueRemindersForSlot(
  admin: SupabaseClient,
  slot: ReminderSlot,
  dueFixtures: Array<{ id: unknown; round_id: unknown; locks_at: unknown }>,
  timeZone: string,
  now: Date,
): Promise<number> {
  if (dueFixtures.length === 0) return 0;

  const byRound = new Map<string, string[]>();
  for (const f of dueFixtures) {
    const list = byRound.get(f.round_id as string) ?? [];
    list.push(f.id as string);
    byRound.set(f.round_id as string, list);
  }

  let queued = 0;

  for (const [roundId, fixtureIds] of byRound) {
    const { data: round } = await admin
      .from("rounds").select("name, season_id").eq("id", roundId).maybeSingle();
    if (!round) continue;

    // Les membres de la ligue de CETTE saison, pas tout le groupe historique :
    // un joueur d'une autre ligue sur une autre compétition ne doit pas être
    // relancé pour un match qui ne le concerne pas.
    const leagueId = await resolveLeagueForSeason(admin, round.season_id as string);
    if (!leagueId) continue;

    const { data: members } = await admin
      .from("league_members")
      .select("user_id, profiles!inner(first_name, is_active)")
      .eq("league_id", leagueId);

    const { data: played } = await admin
      .from("predictions")
      .select("user_id, fixture_id")
      .in("fixture_id", fixtureIds);

    const countByUser = new Map<string, number>();
    for (const p of played ?? []) {
      countByUser.set(p.user_id as string, (countByUser.get(p.user_id as string) ?? 0) + 1);
    }

    for (const member of members ?? []) {
      const userId = member.user_id as string;
      const profile = (Array.isArray(member.profiles) ? member.profiles[0] : member.profiles) as
        | { first_name?: string; is_active?: boolean }
        | null;
      if (profile?.is_active === false) continue;

      const missing = fixtureIds.length - (countByUser.get(userId) ?? 0);
      const vars = { journee: (round.name as string) ?? "cette journée", heures: slot.hoursBefore, restant: Math.max(missing, 0) };

      const outcome = await enqueue(admin, {
        userId,
        kind: "lock_reminder",
        title: renderReminderText(slot.title, vars),
        body: renderReminderText(slot.body, vars),
        url: "/journee",
        // Une clé par créneau, par journée et par jour : les deux créneaux ne
        // se déduplent jamais l'un l'autre, et le planificateur peut repasser
        // toutes les cinq minutes sans jamais doubler quoi que ce soit.
        dedupeKey: dedupeKey("lock_reminder", `${slot.id}:${roundId}`, dayKey(now, timeZone)),
      });
      if (outcome === "queued") queued += 1;
    }
  }

  return queued;
}

/** « La J5 est terminée, découvre le classement. » Une fois par journée close. */
export async function queueRoundDigests(admin: SupabaseClient): Promise<number> {
  const { data: rounds } = await admin
    .from("rounds")
    .select("id, name, status, settled_at")
    .eq("status", "settled")
    .not("settled_at", "is", null)
    .order("settled_at", { ascending: false })
    .limit(3);
  if (!rounds || rounds.length === 0) return 0;

  const { data: members } = await admin.from("group_members").select("user_id");
  let queued = 0;

  for (const round of rounds) {
    for (const member of members ?? []) {
      const outcome = await enqueue(admin, {
        userId: member.user_id as string,
        kind: "round_digest",
        title: `🏆 ${round.name} terminée`,
        body: "Les points sont tombés. Va voir où tu en es.",
        url: "/classement",
        dedupeKey: dedupeKey("round_digest", round.id as string),
      });
      if (outcome === "queued") queued += 1;
    }
  }

  return queued;
}

export async function queueAll(admin: SupabaseClient): Promise<ReminderSummary> {
  return {
    reminders: await queueLockReminders(admin),
    digests: await queueRoundDigests(admin),
  };
}
