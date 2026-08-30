"use client";

import { useRouter } from "next/navigation";

export interface LeagueSelectOption {
  value: string;
  label: string;
  href: string;
}

/**
 * Sélecteur de ligue en liste déroulante — pensé pour un joueur qui
 * appartiendrait à un grand nombre de ligues (pas de pastilles empilées
 * horizontalement). Navigue comme les liens qu'il remplace : chaque option
 * porte l'URL complète du classement pour cette ligue.
 */
export function LeagueSelect({
  options,
  current,
}: {
  options: LeagueSelectOption[];
  current: string;
}) {
  const router = useRouter();

  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
        Ligue
      </span>
      <select
        value={current}
        onChange={(e) => {
          const option = options.find((o) => o.value === e.target.value);
          if (option) router.push(option.href);
        }}
        className="w-full rounded-[14px] border border-line-strong bg-surface px-3 py-2.5 text-[15px] font-semibold text-ink"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
