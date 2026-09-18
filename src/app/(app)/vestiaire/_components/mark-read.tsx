"use client";

/**
 * Marque le fil comme lu à l'ouverture de l'écran, puis prévient la barre de
 * navigation pour qu'elle éteigne sa pastille sans attendre son prochain
 * sondage.
 *
 * Ce travail ne peut pas se faire pendant le rendu du serveur : écrire en base
 * au milieu d'un rendu est interdit, et le résultat serait de toute façon mis
 * en cache. Un petit compagnon client, monté une fois, est l'endroit juste.
 */

import { useEffect } from "react";
import { markVestiaireRead } from "@/lib/feed/actions";

/** L'événement que la barre de navigation écoute. */
export const FEED_READ_EVENT = "vestiaire:lu";

export function MarkFeedRead({ leagueId }: { leagueId: string }) {
  useEffect(() => {
    let cancelled = false;
    markVestiaireRead(leagueId)
      .then(() => {
        if (!cancelled) window.dispatchEvent(new CustomEvent(FEED_READ_EVENT));
      })
      .catch(() => {
        // La pastille restera allumée : c'est le repli sûr.
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  return null;
}
