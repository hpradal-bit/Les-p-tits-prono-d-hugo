import { setting, type Settings } from "../settings/index.ts";
import { toMinutes } from "./schedule.ts";

/**
 * Les garde-fous des notifications, en un seul endroit.
 *
 * Ces valeurs vivent dans `app_settings` (règle n° 1 : aucune donnée métier en
 * dur) et se modifient depuis l'espace admin. Les constantes ci-dessous ne
 * servent qu'au cas où la base serait muette — elles ne sont pas la règle, ce
 * sont des valeurs de repli.
 *
 * Tout est calculé par des fonctions pures : c'est ce qui permet de tester le
 * « qu'est-ce qui part, et quand » sans base ni navigateur.
 */

export interface NotificationRules {
  /** L'interrupteur général. À `false`, plus rien ne part, quoi qu'il arrive. */
  enabled: boolean;
  /** Plafond quotidien par joueur. Au-delà, on laisse tomber. */
  maxPerDay: number;
  /** Début des heures de silence, « 22:00 ». */
  quietFrom: string;
  /** Fin des heures de silence, « 08:00 ». */
  quietTo: string;
  timeZone: string;
}

export const RULES_DEFAULTS: NotificationRules = {
  enabled: true,
  maxPerDay: 3,
  quietFrom: "22:00",
  quietTo: "08:00",
  timeZone: "Europe/Paris",
};

/** Les clés d'`app_settings` correspondantes. Écrites ici, nulle part ailleurs. */
export const RULES_KEYS = {
  enabled: "notifications.enabled",
  maxPerDay: "notifications.max_per_day",
  quietFrom: "notifications.quiet_from",
  quietTo: "notifications.quiet_to",
  timeZone: "notifications.timezone",
} as const;

/** Les règles telles qu'elles sont en base, avec repli sur les valeurs par défaut. */
export function readRules(settings: Settings): NotificationRules {
  return {
    enabled: setting<boolean>(settings, RULES_KEYS.enabled, RULES_DEFAULTS.enabled) !== false,
    maxPerDay: setting<number>(settings, RULES_KEYS.maxPerDay, RULES_DEFAULTS.maxPerDay),
    quietFrom: setting<string>(settings, RULES_KEYS.quietFrom, RULES_DEFAULTS.quietFrom),
    quietTo: setting<string>(settings, RULES_KEYS.quietTo, RULES_DEFAULTS.quietTo),
    timeZone: setting<string>(settings, RULES_KEYS.timeZone, RULES_DEFAULTS.timeZone),
  };
}

/** Le fuseau est-il connu du moteur de dates ? Sinon toute planification dérive. */
export function isKnownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export type RulesErrors = Partial<Record<keyof NotificationRules, string>>;

/**
 * Valide un jeu de règles saisi à l'écran.
 *
 * Le plafond est borné à 20 : au-delà, ce n'est plus un garde-fou, et la
 * première chose qu'un joueur agacé fait est de tout couper — définitivement.
 */
export function validateRules(rules: NotificationRules): RulesErrors {
  const errors: RulesErrors = {};

  if (!Number.isInteger(rules.maxPerDay) || rules.maxPerDay < 1 || rules.maxPerDay > 20) {
    errors.maxPerDay = "Un nombre entier entre 1 et 20.";
  }
  if (toMinutes(rules.quietFrom) === null) {
    errors.quietFrom = "Une heure au format 22:00.";
  }
  if (toMinutes(rules.quietTo) === null) {
    errors.quietTo = "Une heure au format 08:00.";
  }
  if (!isKnownTimeZone(rules.timeZone)) {
    errors.timeZone = "Fuseau horaire inconnu (ex. : Europe/Paris).";
  }

  return errors;
}

/**
 * Les heures de silence, en français.
 *
 * Deux heures identiques ne sont pas une erreur : c'est la façon de dire
 * « pas d'heures de silence », et `isQuiet` la comprend déjà ainsi.
 */
export function describeQuiet(rules: NotificationRules): string {
  if (rules.quietFrom === rules.quietTo) return "aucune heure de silence";
  return `silence de ${rules.quietFrom} à ${rules.quietTo}`;
}

/** Les lignes à écrire dans `app_settings`. */
export function rulesToRows(rules: NotificationRules): { key: string; value: unknown }[] {
  return [
    { key: RULES_KEYS.enabled, value: rules.enabled },
    { key: RULES_KEYS.maxPerDay, value: rules.maxPerDay },
    { key: RULES_KEYS.quietFrom, value: rules.quietFrom },
    { key: RULES_KEYS.quietTo, value: rules.quietTo },
    { key: RULES_KEYS.timeZone, value: rules.timeZone },
  ];
}
