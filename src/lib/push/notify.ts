import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSettings, setting } from "@/lib/settings";
import { sendToUser, type PushPayload } from "./send";
import { scheduleForAll, dayKey, type QuietHours } from "./schedule";
import { readRules } from "./rules";
import { isKindEnabledFor, type CatalogEntry, type PreferenceRow } from "./preferences";

/**
 * Mise en file et envoi des notifications.
 *
 * La table `notifications` est une file, pas un journal : `dedupe_key` rend
 * l'opération idempotente (le planificateur peut repasser autant qu'il veut)
 * et `scheduled_for` porte le report des heures de silence.
 */

export interface NotificationRequest {
  userId: string;
  kind: string;
  title: string;
  body: string;
  url?: string;
  /** Clé de regroupement : sans elle, sept matchs feraient sept messages. */
  dedupeKey: string;
}

export interface EnqueueOptions {
  /** Réservé aux annonces écrites à la main depuis l'espace admin. */
  ignoreDailyCap?: boolean;
}

/**
 * Le sort réservé à une notification :
 *   · `queued`    — en file, partira à l'heure indiquée
 *   · `duplicate` — déjà en file, on ne double pas
 *   · `off`       — l'interrupteur général du groupe est éteint
 *   · `muted`     — ce joueur, ou ce type de message, est coupé
 *   · `capped`    — plafond quotidien atteint
 */
export type EnqueueOutcome = "queued" | "duplicate" | "off" | "muted" | "capped";

interface Prefs {
  /** L'interrupteur général du groupe, réglé depuis l'espace admin. */
  groupEnabled: boolean;
  pushEnabled: boolean;
  /** Celles du groupe, puis celles du joueur : toutes s'appliquent. */
  quiet: QuietHours[];
  timeZone: string;
  maxPerDay: number;
  /** Le catalogue déclaré : lui seul dit ce qui existe et son défaut. */
  catalog: CatalogEntry[];
}

async function loadPrefs(admin: SupabaseClient, userId: string): Promise<Prefs> {
  const settings = await loadSettings(admin);
  const rules = readRules(settings);

  const { data: own } = await admin
    .from("notification_settings")
    .select("push_enabled, quiet_from, quiet_to")
    .eq("user_id", userId)
    .maybeSingle();

  const catalog = setting<CatalogEntry[]>(settings, "notifications.types", []);

  // Les heures du groupe sont un plancher, pas un défaut : les siennes
  // s'ajoutent aux leurs. Un joueur peut se faire plus silencieux — vider ses
  // heures ne doit pas le rendre plus bruyant que le groupe ne l'autorise.
  const quiet: QuietHours[] = [
    { from: rules.quietFrom, to: rules.quietTo, timeZone: rules.timeZone },
  ];
  if (own?.quiet_from && own?.quiet_to) {
    quiet.push({ from: own.quiet_from, to: own.quiet_to, timeZone: rules.timeZone });
  }

  return {
    groupEnabled: rules.enabled,
    pushEnabled: own?.push_enabled ?? true,
    quiet,
    timeZone: rules.timeZone,
    maxPerDay: rules.maxPerDay,
    catalog,
  };
}

/**
 * Met une notification en file. Idempotent : rappeler avec la même clé ne crée
 * pas de doublon, l'index unique de la 0016 s'en charge.
 */
export async function enqueue(
  admin: SupabaseClient,
  request: NotificationRequest,
  options: EnqueueOptions = {},
): Promise<EnqueueOutcome> {
  const prefs = await loadPrefs(admin, request.userId);

  // L'interrupteur général de l'espace admin passe avant tout le reste : à
  // « éteint », le groupe entier est muet, même pour une annonce.
  if (!prefs.groupEnabled) return "off";
  // Le vrai bouton « tout couper » court-circuite tout le reste.
  if (!prefs.pushEnabled) return "muted";
  const { data: pref } = await admin
    .from("notification_preferences")
    .select("kind, is_enabled")
    .eq("user_id", request.userId)
    .eq("kind", request.kind)
    .eq("channel", "push")
    .maybeSingle();

  // Exactement l'arbitrage de l'écran des réglages, par la même fonction :
  // type déclaré et branché, puis choix explicite du joueur, sinon le
  // `default_enabled` du catalogue. Sans ce partage, un type ajouté en
  // « éteint par défaut » serait montré coupé et partirait quand même.
  const enabled = isKindEnabledFor(
    prefs.catalog,
    pref ? [pref as PreferenceRow] : [],
    request.kind,
  );
  if (!enabled) return "muted";

  const now = new Date();
  const today = dayKey(now, prefs.timeZone);

  // Le plafond protège des notifications *automatiques*. Une annonce écrite à
  // la main par l'administration est rare et délibérée : elle peut passer
  // outre, mais jamais outre les heures de silence ni un joueur qui a coupé.
  if (!options.ignoreDailyCap) {
    const { count } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", request.userId)
      .gte("created_at", `${today}T00:00:00Z`);
    if ((count ?? 0) >= prefs.maxPerDay) return "capped";
  }

  const scheduled = scheduleForAll(now, prefs.quiet);

  const { error } = await admin.from("notifications").insert({
    user_id: request.userId,
    kind: request.kind,
    title: request.title,
    body: request.body,
    url: request.url ?? "/",
    dedupe_key: request.dedupeKey,
    scheduled_for: scheduled.toISOString(),
  });

  // 23505 : l'index unique a fait son travail, la notification existait déjà.
  if (error) return error.code === "23505" ? "duplicate" : "muted";
  return "queued";
}

/** Envoie tout ce qui est dû. Appelé par le planificateur. */
export async function flushDue(admin: SupabaseClient, limit = 50): Promise<number> {
  const { data: due } = await admin
    .from("notifications")
    .select("id, user_id, kind, title, body, url")
    .is("sent_at", null)
    .is("failed_at", null)
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for")
    .limit(limit);

  let sent = 0;
  for (const n of due ?? []) {
    const payload: PushPayload = {
      title: n.title as string,
      body: (n.body as string) ?? "",
      url: (n.url as string) ?? "/",
      kind: n.kind as string,
    };
    const result = await sendToUser(admin, n.user_id as string, payload);

    await admin
      .from("notifications")
      .update(
        result.sent > 0
          ? { sent_at: new Date().toISOString() }
          : { failed_at: new Date().toISOString(), error: "aucun abonnement joignable" },
      )
      .eq("id", n.id);

    if (result.sent > 0) sent += 1;
  }
  return sent;
}
