"use client";

import { useState } from "react";

const OPTIONS = [
  {
    value: "season",
    title: "Toute la saison",
    hint: "Tout est rejoué avec le nouveau barème, du premier match à aujourd'hui. Les points déjà marqués peuvent bouger.",
    emoji: "🔁",
  },
  {
    value: "forward",
    title: "À partir de maintenant",
    hint: "Les matchs déjà verrouillés gardent leur barème. Seuls les suivants prennent le nouveau.",
    emoji: "⏭️",
  },
] as const;

/**
 * Le choix de portée, demandé avant tout changement de barème.
 *
 * Les deux réponses sont légitimes — réparer une erreur de réglage ou changer
 * les règles en cours de route — et personne ne peut deviner laquelle l'admin
 * veut. On la lui demande, en disant ce que chacune fait aux points déjà
 * marqués.
 */
export function ScopePicker({
  name = "scope",
  compact = false,
}: {
  name?: string;
  compact?: boolean;
}) {
  const [scope, setScope] = useState<string>("forward");

  // Une tranche d'écart se règle ligne par ligne : cinq encarts complets
  // noieraient l'écran. Même choix, dit en deux mots.
  if (compact) {
    return (
      <fieldset className="flex flex-wrap items-center gap-1.5">
        <legend className="sr-only">Ce changement s&apos;applique à</legend>
        {OPTIONS.map((option) => {
          const selected = scope === option.value;
          return (
            <label
              key={option.value}
              className={`cursor-pointer rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                selected
                  ? "border-clay bg-clay-soft text-clay"
                  : "border-line bg-surface text-ink-muted hover:bg-surface-sunk"
              }`}
              title={option.hint}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => setScope(option.value)}
                className="sr-only"
              />
              {option.value === "season" ? "Toute la saison" : "À partir de maintenant"}
            </label>
          );
        })}
      </fieldset>
    );
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-sage">
        Ce changement s&apos;applique à
      </legend>
      {OPTIONS.map((option) => {
        const selected = scope === option.value;
        return (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
              selected
                ? "border-clay bg-clay-soft"
                : "border-line bg-surface hover:bg-surface-sunk"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => setScope(option.value)}
              className="mt-1"
            />
            <span aria-hidden className="text-base leading-6">{option.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-ink">{option.title}</span>
              <span className="block text-[12.5px] leading-relaxed text-ink-muted">
                {option.hint}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
