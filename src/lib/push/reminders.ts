import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSettings, setting } from "@/lib/settings";
import { resolveLeagueForSeason } from "@/lib/leagues/queries.ts";
import { enqueue } from "./notify";
import { dedupeKey, dayKey } from "./schedule";
import { readLockReminderSlots, renderReminderText, type ReminderSlot } from "./lock-reminder-settings.ts";

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
 * « Il te reste 3 pronos, ça ferme dans 24 h. » puis « ...ça ferme dans 10 h. »
 *
 * Deux créneaux, réglés depuis l'espace admin (délai et texte de chacun),
 * appliqués automatiquement à chaque match — l'admin les enregistre une fois,
 * plus rien à reprogrammer ensuite. Envoyé seulement à ceux à qui il manque
 * quelque chose : prévenir quelqu'un qui a déjà tout joué, c'est la meilleure
 * façon de le faire couper les notifications.
 */
export async function queueLockReminders(admin: SupabaseClient): Promise<number> {
  const settings = await loadSettings(admin);
  const timeZone = setting<string>(settings, "notifications.timezone", "Europe/Paris");
  const slots = readLockReminderSlots(settings).filter((s) => s.enabled);

  let queued = 0;
  for (const slot of slots) {
    queued += await queueRemindersForSlot(admin, slot, timeZone);
  }
  return queued;
}

async function queueRemindersForSlot(
  admin: SupabaseClient,
  slot: ReminderSlot,
  timeZone: string,
): Promise<number> {
  const now = new Date();
  const horizon = new Date(now.getTime() + slot.hoursBefore * 3_600_000);

  // Les matchs qui ferment dans la fenêtre de CE créneau, et pas encore fermés.
  const { data: fixtures } = await admin
    .from("fixtures")
    .select("id, round_id, locks_at")
    .gt("locks_at", now.toISOString())
    .lte("locks_at", horizon.toISOString());
  if (!fixtures || fixtures.length === 0) return 0;

  const byRound = new Map<string, string[]>();
  for (const f of fixtures) {
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
      if (missing <= 0) continue;

      const vars = { journee: (round.name as string) ?? "cette journée", heures: slot.hoursBefore, restant: missing };

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
