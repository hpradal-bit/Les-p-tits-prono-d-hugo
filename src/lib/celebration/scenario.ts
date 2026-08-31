/**
 * L'animation de début de semaine — la partie pure.
 *
 * Rien ici ne recalcule de points ou de classement : `pickScenario` ne fait
 * que lire une ligne de classement déjà calculée par `computeStandings`
 * (règle n° 2 — les points ne sont jamais recalculés côté client, et ici on
 * ne les calcule même pas une seconde fois côté serveur).
 *
 * Fenêtre d'affichage : volontairement simple (jour + heure de la semaine
 * dans le fuseau du jeu), pas un calcul de « lundi précis suivant la fin de
 * la journée » — le vrai garde-fou contre les répétitions est
 * `celebration_views` (une fois vue, jamais revue), pas cette fenêtre.
 */

export type CelebrationScenario =
  | "first"
  | "second"
  | "third"
  | "last"
  | "big_climb"
  | "big_drop"
  | "exact_scores"
  | "default";

export interface CelebrationRow {
  position: number;
  movement: number | null;
  exactScoreCount: number;
}

/** À partir de quel écart de rang une remontée/chute compte comme « grosse ». */
export const CLIMB_THRESHOLD = 3;
/** À partir de combien de scores exacts sur la journée le fait mérite d'être fêté. */
export const EXACT_SCORES_THRESHOLD = 2;

export function pickScenario(row: CelebrationRow, totalPlayers: number): CelebrationScenario {
  if (row.position === 1) return "first";
  if (totalPlayers >= 3 && row.position === totalPlayers) return "last";
  if (row.position === 2) return "second";
  if (row.position === 3) return "third";
  if (row.movement !== null && row.movement >= CLIMB_THRESHOLD) return "big_climb";
  if (row.exactScoreCount >= EXACT_SCORES_THRESHOLD) return "exact_scores";
  if (row.movement !== null && row.movement <= -CLIMB_THRESHOLD) return "big_drop";
  return "default";
}

export interface CelebrationContent {
  emojis: string[];
  title: string;
  subtitle: (roundName: string, points: number) => string;
}

export const CELEBRATION_CONTENT: Record<CelebrationScenario, CelebrationContent> = {
  first: {
    emojis: ["🏆", "👑", "🎉", "⭐", "🥇", "🎉", "👑"],
    title: "TU ES LE ROI DE LA JOURNÉE !",
    subtitle: (round, pts) => `1er sur ${round} · +${pts} pts`,
  },
  second: {
    emojis: ["🥈", "🔥", "👏", "⭐"],
    title: "2e de la journée !",
    subtitle: (round, pts) => `${round} · +${pts} pts`,
  },
  third: {
    emojis: ["🥉", "👏", "🔥"],
    title: "3e de la journée !",
    subtitle: (round, pts) => `${round} · +${pts} pts`,
  },
  last: {
    emojis: ["😂", "👎", "🥲", "🤡", "💀", "👎", "😂"],
    title: "Aïe...",
    subtitle: (round) => `Dernier de ${round} — on se refait sur la suivante`,
  },
  big_climb: {
    emojis: ["🚀", "📈", "🔥", "💪"],
    title: "Grosse remontée !",
    subtitle: (round) => `${round} t'a fait grimper au classement`,
  },
  big_drop: {
    emojis: ["📉", "😭", "🫠", "😂"],
    title: "Chute libre",
    subtitle: (round) => `${round} n'aura pas été la bonne`,
  },
  exact_scores: {
    emojis: ["🎯", "🎯", "🎯", "🔥"],
    title: "L'œil du sniper",
    subtitle: (round, pts) => `Plusieurs scores exacts sur ${round} · +${pts} pts`,
  },
  default: {
    emojis: ["🏉", "📋", "👀"],
    title: "Les résultats sont tombés",
    subtitle: (round, pts) => `${round} · +${pts} pts`,
  },
};

const WEEKDAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * La fenêtre s'ouvre le lundi à 6h (fuseau du jeu) et reste ouverte jusqu'au
 * dimanche suivant inclus — le dimanche seul est exclu, pour ne pas fêter une
 * journée dont le règlement vient à peine de tomber le week-end même.
 */
export function isCelebrationWindowOpen(now: Date, timeZone: string): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");

  if (weekday === "Mon") return hour >= 6;
  return WEEKDAY_ORDER.includes(weekday) && weekday !== "Sun";
}
