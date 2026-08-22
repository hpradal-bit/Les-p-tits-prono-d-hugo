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
  finished: "Terminé",
  official: "Résultat officiel",
  postponed: "Reporté",
  cancelled: "Annulé",
};

/** Un match dont le score compte déjà pour le classement. */
export function hasResult(status: FixtureStatus, homeScore: number | null): boolean {
  return homeScore !== null && status !== "postponed" && status !== "cancelled";
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
