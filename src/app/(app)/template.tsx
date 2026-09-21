/**
 * `template.tsx` reçoit une clé unique par segment (contrairement à
 * `layout.tsx`, qui persiste) : il se remonte à chaque changement d'onglet
 * principal (journée, classement, vestiaire…), jamais sur un changement de
 * paramètre de recherche ni sur une navigation plus profonde dans le même
 * onglet. C'est exactement l'accroche qu'il faut pour un fondu d'entrée —
 * la barre de navigation, elle, vit dans `layout.tsx` et ne bouge jamais.
 */

import type { ReactNode } from "react";

export default function Template({ children }: { children: ReactNode }) {
  return <div className="animate-screen-enter">{children}</div>;
}
