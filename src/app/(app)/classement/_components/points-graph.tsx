"use client";

/**
 * L'évolution des points : les journées en abscisse, les points en ordonnée,
 * une courbe par joueur.
 *
 * Frère du graphique des places, mais adossé aux points réellement marqués
 * (`loadPointsHistory`) et non aux instantanés de fin de journée, qui ne sont
 * écrits qu'à la clôture.
 */

import { useState } from "react";
import { cn } from "@/lib/cn";

interface PlayerLine {
  userId: string;
  firstName: string;
  cumulative: (number | null)[];
}

interface Props {
  players: PlayerLine[];
  roundLabels: string[];
  maxPoints: number;
  viewerId: string | null;
}

const COLORS = [
  "var(--color-clay)",
  "var(--color-sage)",
  "var(--color-winner)",
  "var(--color-perfect)",
  "#6366f1",
  "#ec4899",
];

const PADDING = { top: 16, right: 18, bottom: 28, left: 30 };

/** Un pas de grille lisible : 1, 2, 5, 10, 20… selon l'amplitude. */
export function gridStep(max: number): number {
  for (const step of [1, 2, 5, 10, 20, 50, 100]) {
    if (max / step <= 6) return step;
  }
  return Math.ceil(max / 6);
}

export function PointsGraph({ players, roundLabels, maxPoints, viewerId }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (roundLabels.length === 0 || players.length === 0) return null;

  const step = gridStep(Math.max(maxPoints, 1));
  const top = Math.max(Math.ceil(Math.max(maxPoints, 1) / step) * step, step);
  const width = Math.max(320, roundLabels.length * 52);
  const height = 190;
  const chartW = width - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  // Une seule journée : le point se pose au milieu plutôt que collé à gauche.
  function x(i: number) {
    if (roundLabels.length === 1) return PADDING.left + chartW / 2;
    return PADDING.left + (i / (roundLabels.length - 1)) * chartW;
  }

  function y(points: number) {
    return PADDING.top + (1 - points / top) * chartH;
  }

  function pathD(values: (number | null)[]): string {
    const segments: string[] = [];
    let started = false;
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (value === null) {
        started = false;
        continue;
      }
      segments.push(`${started ? "L" : "M"}${x(i).toFixed(1)},${y(value).toFixed(1)}`);
      started = true;
    }
    return segments.join(" ");
  }

  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Évolution des points
      </p>
      <div className="scrollbar-none overflow-x-auto rounded-2xl border border-line bg-surface p-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[190px]" style={{ minWidth: width }}>
          {ticks.map((value) => (
            <g key={value}>
              <line
                x1={PADDING.left}
                x2={width - PADDING.right}
                y1={y(value)}
                y2={y(value)}
                stroke="var(--color-line)"
                strokeWidth={0.5}
              />
              <text
                x={PADDING.left - 8}
                y={y(value) + 4}
                textAnchor="end"
                className="fill-ink-faint text-[10px]"
              >
                {value}
              </text>
            </g>
          ))}

          {roundLabels.map((label, i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 4}
              textAnchor="middle"
              className="fill-ink-faint text-[9px]"
            >
              {label}
            </text>
          ))}

          {players.map((player, pi) => {
            const isViewer = player.userId === viewerId;
            const isActive = isViewer || hovered === player.userId;
            const dimmed = hovered !== null && hovered !== player.userId && !isViewer;
            const color = COLORS[pi % COLORS.length];

            return (
              <g
                key={player.userId}
                onPointerEnter={() => setHovered(player.userId)}
                onPointerLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <path
                  d={pathD(player.cumulative)}
                  fill="none"
                  stroke={color}
                  strokeWidth={isActive ? 3 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={dimmed ? 0.2 : 1}
                />
                {player.cumulative.map((value, i) =>
                  value !== null ? (
                    <circle
                      key={i}
                      cx={x(i)}
                      cy={y(value)}
                      r={isActive ? 4 : 2.5}
                      fill={color}
                      opacity={dimmed ? 0.2 : 1}
                    />
                  ) : null,
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 px-1">
        {players.map((player, pi) => {
          const last = [...player.cumulative].reverse().find((v) => v !== null);
          return (
            <button
              key={player.userId}
              type="button"
              onPointerEnter={() => setHovered(player.userId)}
              onPointerLeave={() => setHovered(null)}
              className={cn(
                "flex items-center gap-1.5 text-[11px] transition",
                player.userId === viewerId ? "font-bold text-ink" : "text-ink-muted",
                hovered !== null && hovered !== player.userId && "opacity-30",
              )}
            >
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: COLORS[pi % COLORS.length] }}
              />
              {player.firstName}
              {last !== undefined && last !== null && (
                <span className="font-mono text-ink-faint">{last}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
