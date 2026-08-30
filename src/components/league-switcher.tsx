"use client";

import { useRouter } from "next/navigation";

export interface LeagueSwitcherOption {
  value: string;
  label: string;
  href: string;
}

/**
 * Sélecteur de ligue en liste déroulante, partagé par tous les écrans qui
 * proposent de changer de ligue. Pensé pour un joueur qui en aurait des
 * dizaines : jamais une rangée de pastilles qui déborderait à l'infini.
 */
export function LeagueSwitcher({
  options,
  current,
}: {
  options: LeagueSwitcherOption[];
  current: string;
}) {
  const router = useRouter();
  if (options.length < 2) return null;

  return (
    <select
      value={current}
      onChange={(e) => {
        const option = options.find((o) => o.value === e.target.value);
        if (option) router.push(option.href);
      }}
      aria-label="Ligue"
      className="w-full rounded-[14px] border border-line-strong bg-surface px-3 py-2.5 text-[14px] font-semibold text-ink"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
