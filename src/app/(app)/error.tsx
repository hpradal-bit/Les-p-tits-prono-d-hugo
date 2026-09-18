"use client";

/**
 * Le filet de sécurité des écrans de jeu.
 *
 * Sans lui, la moindre requête qui échoue — Supabase qui tousse, un
 * fournisseur qui ne répond pas — renvoyait l'écran d'erreur brut de Next,
 * hors du design et sans porte de sortie. Ici, le joueur garde sa
 * navigation et peut réessayer sans recharger l'application.
 */

import { useEffect } from "react";
import { Button, Card } from "@/components/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Le détail part dans les journaux du serveur, pas à l'écran : il ne
    // dirait rien d'utile au joueur.
    console.error("[écran]", error);
  }, [error]);

  return (
    <Card className="flex flex-col items-center gap-3 p-8 text-center">
      <span className="text-[32px]" aria-hidden>
        🏉
      </span>
      <p className="text-[15px] font-bold text-ink">Ça a glissé des mains.</p>
      <p className="text-[13.5px] leading-relaxed text-ink-muted">
        L&apos;écran n&apos;a pas pu se charger. Rien n&apos;est perdu : tes pronostics et tes
        points sont intacts.
      </p>
      <Button size="sm" onClick={reset}>
        Réessayer
      </Button>
      {error.digest && (
        <p className="font-mono text-[10px] text-ink-faint">code {error.digest}</p>
      )}
    </Card>
  );
}
