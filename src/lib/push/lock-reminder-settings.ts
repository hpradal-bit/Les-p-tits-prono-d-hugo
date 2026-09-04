import { setting, type Settings } from "../settings/index.ts";
import { dayKey, dayKeyMinus, zonedDateTime, toMinutes } from "./schedule.ts";

/**
 * Les deux rappels avant verrouillage — délai (ou heure précise) et texte,
 * entièrement réglables depuis l'espace admin (règle n° 1 : aucune donnée
 * métier en dur).
 *
 * Demande explicite d'Hugo : deux créneaux fixes (pas une liste ouverte —
 * c'est exactement ce qui a été demandé, ni plus ni moins), enregistrés une
 * fois pour toutes et appliqués automatiquement à chaque match, sans avoir à
 * les reprogrammer. Chacun choisit l'un des deux modes :
 *   - "hours_before" : N heures avant la fermeture du match (le mode
 *     d'origine — « 24 h avant »).
 *   - "fixed_time"    : une heure d'horloge précise, N jours avant le jour
 *     de fermeture (« 16 h, la veille » — peu importe l'heure du coup
 *     d'envoi lui-même).
 * Envoyé à TOUS les membres de la ligue concernée, y compris ceux qui ont
 * déjà joué tous leurs pronostics — demande explicite d'Hugo : ce n'est plus
 * un rappel réservé à ceux à qui il manque quelque chose.
 */

export type ReminderSlotMode = "hours_before" | "fixed_time";

export interface ReminderSlot {
  id: "slot_1" | "slot_2";
  /** Un créneau peut être coupé sans perdre son réglage. */
  enabled: boolean;
  mode: ReminderSlotMode;
  /** Utilisé si mode === "hours_before" : délai avant le verrouillage, en heures. */
  hoursBefore: number;
  /** Utilisé si mode === "fixed_time" : jours avant le jour du verrouillage. */
  daysBefore: number;
  /** Utilisé si mode === "fixed_time" : heure d'horloge, « 16:00 ». */
  clockTime: string;
  /** Peut contenir {journee}, {heures}, {restant} — cf. `renderReminderText`. */
  title: string;
  body: string;
}

export const LOCK_REMINDER_SLOTS_DEFAULTS: ReminderSlot[] = [
  {
    id: "slot_1",
    enabled: true,
    mode: "hours_before",
    hoursBefore: 24,
    daysBefore: 1,
    clockTime: "16:00",
    title: "⏰ Encore {heures} h avant la fermeture",
    body: "N'oublie pas de faire tes pronos pour {journee} !",
  },
  {
    id: "slot_2",
    enabled: true,
    mode: "hours_before",
    hoursBefore: 10,
    daysBefore: 0,
    clockTime: "16:00",
    title: "⏰ Dernière ligne droite",
    body: "Il te reste {restant} prono(s) à jouer avant la fermeture de {journee}.",
  },
];

export const LOCK_REMINDER_SLOTS_KEY = "notifications.lock_reminder_slots";

const TITLE_MAX = 100;
const BODY_MAX = 300;
const HOURS_MIN = 1;
const HOURS_MAX = 72;
const DAYS_MIN = 0;
const DAYS_MAX = 7;

function isPlainSlotShape(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Lit les deux créneaux depuis `app_settings`, avec repli sur les valeurs par
 * défaut si la base est muette ou si la forme enregistrée est corrompue —
 * mieux vaut les rappels par défaut que plus aucun rappel du tout. Une ligne
 * enregistrée avant l'ajout du mode « heure précise » (sans `mode`) retombe
 * naturellement sur "hours_before", son seul mode d'alors.
 */
export function readLockReminderSlots(settings: Settings): ReminderSlot[] {
  const raw = setting<unknown>(settings, LOCK_REMINDER_SLOTS_KEY, null);
  if (!Array.isArray(raw) || raw.length !== 2) return LOCK_REMINDER_SLOTS_DEFAULTS;

  const bySlotId = new Map(
    raw.filter(isPlainSlotShape).map((row) => [row.id, row] as const),
  );

  return LOCK_REMINDER_SLOTS_DEFAULTS.map((fallback) => {
    const row = bySlotId.get(fallback.id);
    if (!row) return fallback;
    return {
      id: fallback.id,
      enabled: typeof row.enabled === "boolean" ? row.enabled : fallback.enabled,
      mode: row.mode === "fixed_time" || row.mode === "hours_before" ? row.mode : fallback.mode,
      hoursBefore: typeof row.hoursBefore === "number" ? row.hoursBefore : fallback.hoursBefore,
      daysBefore: typeof row.daysBefore === "number" ? row.daysBefore : fallback.daysBefore,
      clockTime: typeof row.clockTime === "string" && toMinutes(row.clockTime) !== null
        ? row.clockTime
        : fallback.clockTime,
      title: typeof row.title === "string" && row.title.trim() ? row.title : fallback.title,
      body: typeof row.body === "string" && row.body.trim() ? row.body : fallback.body,
    };
  });
}

export interface ReminderSlotInput {
  enabled: boolean;
  mode: ReminderSlotMode;
  hoursBefore: number;
  daysBefore: number;
  clockTime: string;
  title: string;
  body: string;
}

export type SlotErrors = Partial<Record<"hoursBefore" | "daysBefore" | "clockTime" | "title" | "body", string>>;
export type ReminderSlotsErrors = Partial<Record<"slot_1" | "slot_2", SlotErrors>>;

/** Valide les deux créneaux saisis à l'écran. */
export function validateReminderSlots(inputs: ReminderSlotInput[]): ReminderSlotsErrors {
  const errors: ReminderSlotsErrors = {};
  const ids: Array<"slot_1" | "slot_2"> = ["slot_1", "slot_2"];

  inputs.forEach((input, i) => {
    const slotErrors: SlotErrors = {};

    if (input.mode === "hours_before") {
      if (!Number.isInteger(input.hoursBefore) || input.hoursBefore < HOURS_MIN || input.hoursBefore > HOURS_MAX) {
        slotErrors.hoursBefore = `Un nombre entier entre ${HOURS_MIN} et ${HOURS_MAX}.`;
      }
    } else {
      if (!Number.isInteger(input.daysBefore) || input.daysBefore < DAYS_MIN || input.daysBefore > DAYS_MAX) {
        slotErrors.daysBefore = `Un nombre entier entre ${DAYS_MIN} et ${DAYS_MAX}.`;
      }
      if (toMinutes(input.clockTime) === null) {
        slotErrors.clockTime = "Une heure au format 16:00.";
      }
    }

    // Un créneau coupé garde son texte en base (pour le réactiver tel quel
    // plus tard) mais n'a pas besoin d'être valide tant qu'il est éteint.
    if (input.enabled) {
      if (!input.title.trim()) slotErrors.title = "Le titre ne peut pas être vide.";
      else if (input.title.length > TITLE_MAX) slotErrors.title = `${TITLE_MAX} caractères au plus.`;
      if (!input.body.trim()) slotErrors.body = "Le texte ne peut pas être vide.";
      else if (input.body.length > BODY_MAX) slotErrors.body = `${BODY_MAX} caractères au plus.`;
    }
    if (Object.keys(slotErrors).length > 0) errors[ids[i]] = slotErrors;
  });

  return errors;
}

/** La ligne à écrire dans `app_settings`. */
export function reminderSlotsToRow(inputs: ReminderSlotInput[]): { key: string; value: ReminderSlot[] } {
  const ids: Array<"slot_1" | "slot_2"> = ["slot_1", "slot_2"];
  return {
    key: LOCK_REMINDER_SLOTS_KEY,
    value: inputs.map((input, i) => ({ id: ids[i], ...input })),
  };
}

export interface ReminderTextVars {
  /** Le nom de la journée, « J3 » par exemple. */
  journee: string;
  /** Le délai de CE créneau, en heures — pas forcément celui d'un autre créneau. */
  heures: number;
  /** Le nombre de pronostics qu'il reste à jouer, pour CE joueur. */
  restant: number;
}

/**
 * Remplace {journee}, {heures} et {restant} dans un texte personnalisé.
 * Une accolade non reconnue est laissée telle quelle plutôt que de faire
 * échouer l'envoi — un texte mal formé reste préférable à aucun texte.
 */
export function renderReminderText(template: string, vars: ReminderTextVars): string {
  return template
    .replaceAll("{journee}", vars.journee)
    .replaceAll("{heures}", String(vars.heures))
    .replaceAll("{restant}", String(vars.restant));
}

/**
 * L'instant où CE créneau doit partir pour UN match donné.
 *
 *   - "hours_before" : le verrouillage moins le délai — le comportement
 *     d'origine.
 *   - "fixed_time"    : le jour du verrouillage moins `daysBefore` jours, à
 *     `clockTime` précises, dans le fuseau du jeu — indépendant de l'heure du
 *     coup d'envoi lui-même.
 */
export function reminderTargetSendTime(
  slot: ReminderSlot,
  fixtureLocksAt: Date,
  timeZone: string,
): Date {
  if (slot.mode === "fixed_time") {
    const lockDay = dayKey(fixtureLocksAt, timeZone);
    const targetDay = dayKeyMinus(lockDay, slot.daysBefore);
    return zonedDateTime(targetDay, slot.clockTime, timeZone);
  }
  return new Date(fixtureLocksAt.getTime() - slot.hoursBefore * 3_600_000);
}
