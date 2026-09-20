"use client";

/**
 * « Mis à jour il y a 12 s » sous un match live — pour que le joueur (et nous,
 * en cas de souci) sache tout de suite si la synchro suit le match ou si elle
 * est restée en rade. Rien à cet écran ne le disait avant : un score figé
 * chez le fournisseur ressemblait à un match sans action, indiscernable de
 * l'intérieur de l'application (incident du 16 septembre).
 *
 * Ne rend rien au premier rendu serveur : l'heure du navigateur, pas celle du
 * serveur, doit décider du texte affiché — évite un décalage visible à
 * l'hydratation plutôt qu'un texte qui saute une fois monté.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { lastSyncedLabel } from "@/lib/standings/format";

export function LastSynced({ at, className }: { at: string | null; className?: string }) {
  // Le texte se déduit de `at` et de l'heure courante à chaque rendu — cette
  // variable ne sert qu'à en redemander un toutes les 5 s, jamais à porter
  // elle-même le texte affiché.
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!at) return;
    const id = setInterval(() => forceTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, [at]);

  if (!at) return null;
  return (
    <span className={cn("font-mono text-[10px] text-ink-faint", className)}>
      Mis à jour {lastSyncedLabel(at)}
    </span>
  );
}
