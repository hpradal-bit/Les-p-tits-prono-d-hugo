"use client";

import { useState } from "react";

/**
 * Repli/dépli d'une journée dans « Mes pronos ». Volontairement en état
 * local simple (pas de librairie) : le contenu replié n'est tout simplement
 * pas rendu, donc son `PredictionsBoard` éventuel ne s'hydrate jamais tant
 * qu'on ne l'ouvre pas — la saison entière tient sur l'écran sans alourdir
 * la page au chargement.
 */
export function RoundSection({
  id,
  banner,
  defaultOpen,
  children,
}: {
  id: string;
  banner: React.ReactNode;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section id={id} className="scroll-mt-24 flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left"
        aria-expanded={open}
      >
        {banner}
      </button>
      {open && <div className="flex flex-col gap-4">{children}</div>}
    </section>
  );
}
