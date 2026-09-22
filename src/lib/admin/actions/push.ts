"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Uuid } from "@/lib/types";
import { loadSettings } from "@/lib/settings";
import { loadPublicKey, sendToUser } from "@/lib/push/send";
import { enqueue, type EnqueueOutcome } from "@/lib/push/notify";
import { scheduleFor } from "@/lib/push/schedule";
import { describeQuiet, readRules, rulesToRows, validateRules } from "@/lib/push/rules";
import {
  readLockReminderSlots,
  reminderSlotsToRow,
  validateReminderSlots,
  type ReminderSlotInput,
} from "@/lib/push/lock-reminder-settings";
import { requireAdmin } from "../auth";
import { logAdminAction } from "../log";
import { adminFail, adminOk, type AdminActionState } from "../types";
import { fieldErrorsOf, handle } from "./shared";

/**
 * Notifications push — clé VAPID, annonces, garde-fous, rappels de
 * verrouillage. Extrait de l'ancien `actions.ts` (audit technique, tâche
 * « Split admin/actions.ts »). Pur déplacement : aucun comportement ni
 * signature ne change, `../../actions.ts` réexporte tout.
 *
 * Trois actions, trois portées distinctes :
 *
 *   · le **test** ne parle qu'à l'administrateur et court-circuite tout — file,
 *     plafond, heures de silence. C'est un diagnostic : il doit sonner tout de
 *     suite, ou dire précisément pourquoi il n'a pas sonné.
 *   · l'**annonce** passe par la file, donc respecte les heures de silence et
 *     les joueurs qui ont coupé. Elle ignore le seul plafond quotidien, qui
 *     existe pour brider l'automatique, pas la parole de l'organisation.
 *   · les **garde-fous** ne font que réécrire `app_settings`.
 */

/**
 * Une clé publique VAPID est un point de courbe P-256 non compressé, encodé en
 * base64url : 65 octets, donc 87 caractères, et un premier octet `0x04` qui se
 * lit « B » une fois encodé. On vérifie la forme plutôt que d'accepter
 * n'importe quoi : une clé mal collée laisserait les notifications
 * silencieusement mortes, sans rien à l'écran pour le dire.
 */
const vapidSchema = z.object({
  vapidKey: z
    .string()
    .trim()
    .regex(/^B[A-Za-z0-9_-]{86}$/, "Clé publique VAPID invalide."),
});

export async function updateVapidKey(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = vapidSchema.safeParse({
      vapidKey: formData.get("vapidKey"),
    });
    if (!parsed.success) {
      return adminFail(
        "Clé publique VAPID invalide : 87 caractères commençant par « B ».",
        { fieldErrors: fieldErrorsOf(parsed.error) },
      );
    }
    const { vapidKey } = parsed.data;

    const admin = createAdminClient();
    const before = await loadPublicKey(admin);
    if (before === vapidKey) return adminOk("Cette clé est déjà enregistrée.");

    const { error } = await admin
      .from("app_settings")
      .upsert(
        { key: "push_notifications.vapid_public_key", value: vapidKey, updated_by: ctx.userId },
        { onConflict: "key" },
      );
    if (error) throw error;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "push.vapid_key_changed",
      entityType: "app_setting",
      entityId: null,
      // La clé est publique, mais la journaliser entière n'apprend rien : on
      // garde de quoi reconnaître laquelle a remplacé laquelle.
      before: { key_suffix: before ? before.slice(-8) : null },
      after: { key_suffix: vapidKey.slice(-8) },
      reason: "Clé VAPID modifiée depuis l'espace admin.",
    });

    revalidatePath("/reglages");
    revalidatePath("/admin/push-settings");
    return adminOk(
      before
        ? "Clé enregistrée. Les joueurs devront réactiver leurs notifications : les anciens abonnements ne valent plus."
        : "Clé enregistrée. Les notifications sont disponibles depuis l'écran Réglages.",
    );
  } catch (error) {
    return handle(error);
  }
}

const announcementSchema = z.object({
  title: z.string().trim().min(3, "Trois caractères minimum.").max(80, "80 caractères maximum."),
  body: z.string().trim().min(3, "Trois caractères minimum.").max(300, "300 caractères maximum."),
  url: z.string().trim().max(200).optional(),
});

const rulesSchema = z.object({
  enabled: z.coerce.boolean(),
  maxPerDay: z.coerce.number(),
  quietFrom: z.string().trim(),
  quietTo: z.string().trim(),
  timeZone: z.string().trim(),
});

/** Les joueurs actifs du groupe — les destinataires d'une annonce. */
async function activeMemberIds(admin: SupabaseClient, groupId: Uuid): Promise<Uuid[]> {
  const { data, error } = await admin
    .from("group_members")
    .select("user_id, profiles:user_id (is_active)")
    .eq("group_id", groupId);
  if (error) throw error;

  return (data ?? [])
    .filter((m) => {
      const p = (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles) as
        | { is_active?: boolean }
        | null;
      return p?.is_active !== false;
    })
    .map((m) => m.user_id as Uuid);
}

/**
 * Envoie une notification à l'administrateur, tout de suite.
 *
 * Volontairement hors de la file : le but est de répondre à « est-ce que ça
 * marche vraiment ? », et une réponse qui arrive au prochain passage du
 * planificateur ne répond à rien.
 */
export async function sendTestNotification(
  _prev: AdminActionState,
  _formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const admin = createAdminClient();

    if (!(await loadPublicKey(admin))) {
      return adminFail("Aucune clé publique enregistrée : renseigne-la avant de tester.");
    }
    if (!process.env.VAPID_PRIVATE_KEY) {
      return adminFail("La clé privée manque côté serveur (variable VAPID_PRIVATE_KEY chez Vercel).");
    }

    const { count } = await admin
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .is("revoked_at", null);

    if ((count ?? 0) === 0) {
      return adminFail(
        "Aucun appareil abonné pour toi. Va dans Réglages, active l'interrupteur, puis reviens.",
      );
    }

    const result = await sendToUser(admin, ctx.userId, {
      title: "Test des notifications",
      body: "Si tu lis ceci, tout fonctionne. Bonne saison 🏉",
      url: "/reglages",
      kind: "announcement",
      tag: "test",
    });

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "push.test_sent",
      entityType: "app_setting",
      entityId: null,
      before: null,
      after: { sent: result.sent, failed: result.failed, revoked: result.revoked },
      reason: "Test de notification envoyé depuis l'espace admin.",
    });

    if (result.sent > 0) {
      return adminOk(
        `Message parti vers ${result.sent} appareil${result.sent > 1 ? "s" : ""}. Il devrait s'afficher dans quelques secondes.`,
        result.revoked > 0
          ? { details: [`${result.revoked} abonnement périmé a été retiré au passage.`] }
          : {},
      );
    }

    return adminFail("Aucun appareil n'a accepté le message.", {
      details:
        result.errors.length > 0
          ? result.errors
          : ["Le service de push n'a rien renvoyé d'exploitable."],
    });
  } catch (error) {
    return handle(error);
  }
}

/**
 * Écrit un message et l'envoie à tout le groupe.
 *
 * Le compte rendu distingue chaque sort possible : une annonce avalée par les
 * réglages d'un joueur doit se voir, sinon l'administrateur croit avoir parlé
 * dans le vide — ou pire, croit avoir été entendu.
 */
export async function sendAnnouncement(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = announcementSchema.safeParse({
      title: formData.get("title"),
      body: formData.get("body"),
      url: formData.get("url") ?? undefined,
    });
    if (!parsed.success) {
      return adminFail("Message incomplet.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const { title, body, url } = parsed.data;

    const admin = createAdminClient();
    const settings = await loadSettings(admin);
    const rules = readRules(settings);

    if (!rules.enabled) {
      return adminFail(
        "Les notifications du groupe sont éteintes : rallume-les avant d'envoyer une annonce.",
      );
    }

    const members = await activeMemberIds(admin, ctx.groupId);
    // Un horodatage dans la clé : deux annonces de suite ne se dédoublonnent pas.
    const stamp = new Date().toISOString();
    const tally: Record<EnqueueOutcome, number> = {
      queued: 0, duplicate: 0, off: 0, muted: 0, capped: 0,
    };

    for (const userId of members) {
      const outcome = await enqueue(
        admin,
        {
          userId,
          kind: "announcement",
          title,
          body,
          url: url && url.length > 0 ? url : "/",
          dedupeKey: `announcement:${ctx.userId}:${stamp}`,
        },
        // Une annonce est délibérée et rare : le plafond du jour, qui protège
        // du bruit automatique, ne doit pas l'étouffer.
        { ignoreDailyCap: true },
      );
      tally[outcome] += 1;
    }

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "push.announcement_sent",
      entityType: "app_setting",
      entityId: null,
      before: null,
      after: { title, body, recipients: tally.queued, muted: tally.muted },
      reason: `Annonce envoyée : ${title}.`,
      event: { payload: { title } },
    });

    // Les heures de silence peuvent décaler l'envoi : autant le dire tout de suite.
    const departure = scheduleFor(new Date(), {
      from: rules.quietFrom, to: rules.quietTo, timeZone: rules.timeZone,
    });
    const delayed = departure.getTime() - Date.now() > 60_000;

    if (tally.queued === 0) {
      return adminFail("Personne ne recevra ce message.", {
        details: [
          tally.muted > 0
            ? `${tally.muted} joueur${tally.muted > 1 ? "s ont" : " a"} coupé les notifications ou ce type de message.`
            : "Aucun joueur actif à qui écrire.",
        ],
      });
    }

    const details: string[] = [];
    if (delayed) {
      details.push(
        `Heures de silence en cours : départ prévu à ${new Intl.DateTimeFormat("fr-FR", {
          hour: "2-digit", minute: "2-digit", timeZone: rules.timeZone,
        }).format(departure)}.`,
      );
    }
    if (tally.muted > 0) {
      details.push(`${tally.muted} joueur${tally.muted > 1 ? "s" : ""} ne le recevra pas (notifications coupées).`);
    }

    revalidatePath("/admin/push-settings");
    return adminOk(
      `Message mis en file pour ${tally.queued} joueur${tally.queued > 1 ? "s" : ""}.`,
      details.length > 0 ? { details } : {},
    );
  } catch (error) {
    return handle(error);
  }
}

/** Les garde-fous du groupe : interrupteur, plafond, heures de silence. */
export async function updateNotificationRules(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const parsed = rulesSchema.safeParse({
      enabled: formData.get("enabled") === "on" || formData.get("enabled") === "true",
      maxPerDay: formData.get("maxPerDay"),
      quietFrom: formData.get("quietFrom"),
      quietTo: formData.get("quietTo"),
      timeZone: formData.get("timeZone"),
    });
    if (!parsed.success) {
      return adminFail("Réglages invalides.", { fieldErrors: fieldErrorsOf(parsed.error) });
    }
    const input = parsed.data;

    // La validation métier vit dans une fonction pure, donc testable — et la
    // même que celle qui décrit les règles à l'écran.
    const errors = validateRules(input);
    if (Object.keys(errors).length > 0) {
      return adminFail("Réglages invalides.", {
        fieldErrors: Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v]])),
      });
    }

    const admin = createAdminClient();
    const before = readRules(await loadSettings(admin));

    const { error } = await admin.from("app_settings").upsert(
      rulesToRows(input).map((r) => ({ ...r, updated_by: ctx.userId })),
      { onConflict: "key" },
    );
    if (error) throw error;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "push.rules_changed",
      entityType: "app_setting",
      entityId: null,
      before,
      after: input,
      reason: "Réglages de notification modifiés depuis l'espace admin.",
    });

    revalidatePath("/admin/push-settings");
    revalidatePath("/reglages");

    return adminOk(
      input.enabled
        ? `Réglages enregistrés : ${input.maxPerDay} message${input.maxPerDay > 1 ? "s" : ""} par jour au plus, ${describeQuiet(input)}.`
        : "Notifications éteintes pour tout le groupe. Plus rien ne partira, même une annonce.",
    );
  } catch (error) {
    return handle(error);
  }
}

const reminderSlotFormSchema = z.object({
  enabled: z.coerce.boolean(),
  mode: z.enum(["hours_before", "fixed_time"]),
  hoursBefore: z.coerce.number(),
  daysBefore: z.coerce.number(),
  clockTime: z.string().trim(),
  title: z.string().trim(),
  body: z.string().trim(),
});
const reminderSlotsSchema = z.tuple([reminderSlotFormSchema, reminderSlotFormSchema]);

/**
 * Les deux rappels avant verrouillage : délai et texte de chacun, réglés une
 * fois pour toutes et appliqués automatiquement à chaque match ensuite —
 * demande explicite d'Hugo, aucune reprogrammation manuelle nécessaire.
 */
export async function updateLockReminderSlots(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    const ctx = await requireAdmin();
    const raw = [1, 2].map((n) => ({
      enabled: formData.get(`slot${n}Enabled`) === "on" || formData.get(`slot${n}Enabled`) === "true",
      mode: formData.get(`slot${n}Mode`),
      hoursBefore: formData.get(`slot${n}HoursBefore`),
      daysBefore: formData.get(`slot${n}DaysBefore`),
      clockTime: formData.get(`slot${n}ClockTime`),
      title: formData.get(`slot${n}Title`),
      body: formData.get(`slot${n}Body`),
    }));
    const parsed = reminderSlotsSchema.safeParse(raw);
    if (!parsed.success) {
      return adminFail("Réglages invalides.");
    }
    const input: ReminderSlotInput[] = parsed.data;

    const errors = validateReminderSlots(input);
    if (Object.keys(errors).length > 0) {
      const fieldErrors: Record<string, string[]> = {};
      const messages: string[] = [];
      (["slot_1", "slot_2"] as const).forEach((id, i) => {
        const slotErrors = errors[id];
        if (!slotErrors) return;
        for (const [field, message] of Object.entries(slotErrors)) {
          fieldErrors[`slot${i + 1}${field[0].toUpperCase()}${field.slice(1)}`] = [message];
          messages.push(`Créneau ${i + 1} — ${message}`);
        }
      });
      return adminFail(messages.join(" "), { fieldErrors });
    }

    const admin = createAdminClient();
    const before = readLockReminderSlots(await loadSettings(admin));
    const row = reminderSlotsToRow(input);

    const { error } = await admin
      .from("app_settings")
      .upsert({ ...row, updated_by: ctx.userId }, { onConflict: "key" });
    if (error) throw error;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "push.lock_reminder_slots_changed",
      entityType: "app_setting",
      entityId: null,
      before,
      after: row.value,
      reason: "Rappels de verrouillage modifiés depuis l'espace admin.",
    });

    revalidatePath("/admin/push-settings");

    const active = input.filter((s) => s.enabled).length;
    return adminOk(
      active === 0
        ? "Les deux créneaux sont enregistrés, mais coupés : aucun rappel ne partira."
        : `${active} créneau${active > 1 ? "x" : ""} de rappel enregistré${active > 1 ? "s" : ""}.`,
    );
  } catch (error) {
    return handle(error);
  }
}
