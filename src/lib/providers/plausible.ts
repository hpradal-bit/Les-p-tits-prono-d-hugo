import type { ProviderStandingRow } from "./types.ts";

/**
 * Le classement reçu appartient-il bien à la saison en cours ?
 *
 * Cas vécu, et il n'avait rien d'évident : le calendrier d'ESPN donnait la
 * bonne saison 2026-27, mais son classement renvoyait le tableau **final de la
 * saison précédente** — 26 journées jouées, points définitifs, et un club
 * relégué à la place du promu. Écrit tel quel en base, ce tableau devient le
 * « classement du Top 14 » affiché aux joueurs, avec une équipe qui n'y est
 * plus.
 *
 * Aucune bascule de fournisseur n'aurait rattrapé ça : la réponse était un
 * succès parfaitement formé. Seule la cohérence avec ce qu'on sait de notre
 * propre saison permet de la démasquer — d'où cette fonction pure, qui ne
 * connaît ni ESPN ni API-Sports.
 */

export interface PlausibilityVerdict {
  ok: boolean;
  /** Ce qui cloche, en français, prêt à être journalisé. */
  reason?: string;
}

/**
 * Un classement est refusé s'il annonce plus de journées jouées que la saison
 * n'en a réellement disputées.
 *
 * La marge d'une journée n'est pas de la complaisance : un fournisseur peut
 * compter un match terminé quelques minutes avant que notre propre
 * synchronisation ne l'enregistre. Au-delà, ce n'est plus un décalage, c'est
 * une autre saison.
 */
export function checkStandingsFreshness(
  rows: ProviderStandingRow[],
  finishedRoundsInSeason: number,
): PlausibilityVerdict {
  if (rows.length === 0) return { ok: true };

  const claimed = Math.max(...rows.map((r) => r.played));
  const tolerated = finishedRoundsInSeason + 1;

  if (claimed > tolerated) {
    return {
      ok: false,
      reason:
        `classement écarté : le fournisseur annonce ${claimed} journées jouées, ` +
        `or la saison n'en compte que ${finishedRoundsInSeason} de terminées. ` +
        `C'est le tableau d'une autre saison — rien n'a été écrit.`,
    };
  }

  return { ok: true };
}

/**
 * Le classement décrit-il le bon effectif ?
 *
 * Un promu ou un relégué suffit à trahir un tableau périmé, même quand le
 * nombre de journées, lui, serait plausible — en début de saison, « 0 journée
 * jouée » ne prouve rien.
 *
 * On ne refuse pas sur ce seul motif : un nom non rapproché est déjà signalé
 * ailleurs, et une équipe manquante peut n'être qu'une graphie inconnue. Mais
 * quand *plusieurs* clubs de notre effectif sont absents du tableau, ce n'est
 * plus une question d'orthographe.
 */
export function checkStandingsRoster(
  matchedTeamIds: string[],
  seasonTeamCount: number,
): PlausibilityVerdict {
  if (seasonTeamCount === 0) return { ok: true };

  const missing = seasonTeamCount - new Set(matchedTeamIds).size;
  // Un absent : probablement une graphie. Deux ou plus : un autre effectif.
  if (missing >= 2) {
    return {
      ok: false,
      reason:
        `classement écarté : ${missing} clubs de la saison sont absents du tableau reçu. ` +
        `Le fournisseur décrit un autre effectif — rien n'a été écrit.`,
    };
  }

  return { ok: true };
}
