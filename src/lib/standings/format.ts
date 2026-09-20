/**
 * Mise en forme française des données de match. Uniquement du vocabulaire
 * d'interface : aucune règle de jeu ne se cache ici.
 */

import { format } from "date-fns";
import { fr } from "date-fns/locale";
import type { FixtureStatus, MatchOutcome, Team } from "@/lib/types";

export const FIXTURE_STATUS_LABEL: Record<FixtureStatus, string> = {
  scheduled: "À venir",
  live: "En cours",
  halftime: "Mi-temps",
  finished: "Terminé",
  official: "Résultat officiel",
  postponed: "Reporté",
  cancelled: "Annulé",
};

/** Un match dont le score compte déjà pour le classement. */
export function hasResult(status: FixtureStatus, homeScore: number | null): boolean {
  return homeScore !== null && status !== "postponed" && status !== "cancelled";
}

/** Le match se joue en ce moment — mi-temps comprise, elle n'est pas une pause du direct. */
export function isInProgress(status: FixtureStatus): boolean {
  return status === "live" || status === "halftime";
}

/** « 34' », « MI-TEMPS », ou « LIVE » à défaut de minute connue. */
export function liveBadgeLabel(status: FixtureStatus, minute: number | null): string {
  if (status === "halftime") return "MI-TEMPS";
  return minute ? `${minute}'` : "LIVE";
}

/**
 * « il y a 12 s », « il y a 4 min », ou « à 21h27 » passé une heure — pour
 * qu'un match live dise quand il a été rafraîchi pour la dernière fois. C'est
 * ce qui aurait permis de repérer un score figé chez le fournisseur en
 * direct, plutôt que deux semaines après (incident du 16 septembre).
 */
export function lastSyncedLabel(iso: string, now: number = Date.now()): string {
  const at = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 5) return "à l'instant";
  if (seconds < 60) return `il y a ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 2) {
    const d = new Date(iso);
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    return `à ${hh}h${mm}`;
  }
  return `il y a ${hours} h`;
}

export function formatKickoff(iso: string): string {
  return format(new Date(iso), "EEEE d MMMM 'à' HH'h'mm", { locale: fr });
}

export function formatShortKickoff(iso: string): string {
  return format(new Date(iso), "EEE d MMM · HH'h'mm", { locale: fr });
}

export function formatDateTime(iso: string): string {
  return format(new Date(iso), "d MMMM yyyy 'à' HH'h'mm", { locale: fr });
}

/** « Toulouse », « Bayonne » ou « Match nul », selon l'issue pronostiquée. */
export function outcomeLabel(outcome: MatchOutcome, home: Team, away: Team): string {
  if (outcome === "home") return home.shortName;
  if (outcome === "away") return away.shortName;
  return "Match nul";
}

/** Le résumé d'un pronostic : issue, tranche d'écart, score exact tenté. */
export function predictionSummary(prediction: {
  outcome: MatchOutcome;
  marginBucketLabel: string | null;
  marginValue: number | null;
  exactHomeScore: number | null;
  exactAwayScore: number | null;
}, home: Team, away: Team): string {
  const parts: string[] = [outcomeLabel(prediction.outcome, home, away)];
  if (prediction.marginBucketLabel) parts.push(`écart ${prediction.marginBucketLabel}`);
  else if (prediction.marginValue !== null) parts.push(`écart ${prediction.marginValue}`);
  if (prediction.exactHomeScore !== null && prediction.exactAwayScore !== null) {
    parts.push(`score exact ${prediction.exactHomeScore}-${prediction.exactAwayScore}`);
  }
  return parts.join(" · ");
}
