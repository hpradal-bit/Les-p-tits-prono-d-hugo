import { setting, type Settings } from "../settings/index.ts";

/**
 * Les deux rappels avant verrouillage — délai et texte, entièrement réglables
 * depuis l'espace admin (règle n° 1 : aucune donnée métier en dur).
 *
 * Demande explicite d'Hugo : deux créneaux fixes (pas une liste ouverte —
 * c'est exactement ce qui a été demandé, ni plus ni moins), chacun avec son
 * propre délai avant `fixtures.locks_at` et son propre texte, enregistrés une
 * fois pour toutes et appliqués automatiquement à chaque match, sans avoir à
 * les reprogrammer.
 */

export interface ReminderSlot {
  id: "slot_1" | "slot_2";
  /** Un créneau peut être coupé sans perdre son réglage. */
  enabled: boolean;
  /** Délai avant le verrouillage du match, en heures. */
  hoursBefore: number;
  /** Peut contenir {journee}, {heures}, {restant} — cf. `renderReminderText`. */
  title: string;
  body: string;
}

export const LOCK_REMINDER_SLOTS_DEFAULTS: ReminderSlot[] = [
  {
    id: "slot_1",
    enabled: true,
    hoursBefore: 24,
    title: "⏰ Encore {heures} h avant la fermeture",
    body: "N'oublie pas de faire tes pronos pour {journee} !",
  },
  {
    id: "slot_2",
    enabled: true,
    hoursBefore: 10,
    title: "⏰ Dernière ligne droite",
    body: "Il te reste {restant} prono(s) à jouer avant la fermeture de {journee}.",
  },
];

export const LOCK_REMINDER_SLOTS_KEY = "notifications.lock_reminder_slots";

const TITLE_MAX = 100;
const BODY_MAX = 300;
const HOURS_MIN = 1;
const HOURS_MAX = 72;

function isPlainSlotShape(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Lit les deux créneaux depuis `app_settings`, avec repli sur les valeurs par
 * défaut si la base est muette ou si la forme enregistrée est corrompue —
 * mieux vaut les rappels par défaut que plus aucun rappel du tout.
 */
export function readLockReminderSlots(settings: Settings): ReminderSlot[] {
  const raw = setting<unknown>(settings, LOCK_REMINDER_SLOTS_KEY, null);
  if (!Array.isArray(raw) || raw.length !== 2) return LOCK_REMINDER_SLOTS_DEFAULTS;

  const bySlotId = new Map(
    raw.filter(isPlainSlotShape).map((row) => [row.id, row] as const),
  );

  const slots = LOCK_REMINDER_SLOTS_DEFAULTS.map((fallback) => {
    const row = bySlotId.get(fallback.id);
    if (!row) return fallback;
    return {
      id: fallback.id,
      enabled: typeof row.enabled === "boolean" ? row.enabled : fallback.enabled,
      hoursBefore: typeof row.hoursBefore === "number" ? row.hoursBefore : fallback.hoursBefore,
      title: typeof row.title === "string" && row.title.trim() ? row.title : fallback.title,
      body: typeof row.body === "string" && row.body.trim() ? row.body : fallback.body,
    };
  });

  return slots;
}

export interface ReminderSlotInput {
  enabled: boolean;
  hoursBefore: number;
  title: string;
  body: string;
}

export type SlotErrors = Partial<Record<"hoursBefore" | "title" | "body", string>>;
export type ReminderSlotsErrors = Partial<Record<"slot_1" | "slot_2", SlotErrors>>;

/** Valide les deux créneaux saisis à l'écran. */
export function validateReminderSlots(inputs: ReminderSlotInput[]): ReminderSlotsErrors {
  const errors: ReminderSlotsErrors = {};
  const ids: Array<"slot_1" | "slot_2"> = ["slot_1", "slot_2"];

  inputs.forEach((input, i) => {
    const slotErrors: SlotErrors = {};
    if (!Number.isInteger(input.hoursBefore) || input.hoursBefore < HOURS_MIN || input.hoursBefore > HOURS_MAX) {
      slotErrors.hoursBefore = `Un nombre entier entre ${HOURS_MIN} et ${HOURS_MAX}.`;
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
