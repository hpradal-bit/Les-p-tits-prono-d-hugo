"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

interface PlayerLine {
  userId: string;
  firstName: string;
  color: string;
  positions: (number | null)[];
}

interface Props {
  players: PlayerLine[];
  roundLabels: string[];
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

const PADDING = { top: 20, right: 16, bottom: 28, left: 28 };

export function StandingsGraph({ players, roundLabels, viewerId }: Props) {
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null);

  if (roundLabels.length < 2 || players.length === 0) return null;

  const totalPlayers = players.length;
  const width = Math.max(320, roundLabels.length * 48);
  const height = 180;
  const chartW = width - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  function x(i: number) {
    return PADDING.left + (i / (roundLabels.length - 1)) * chartW;
  }

  function y(position: number) {
    return PADDING.top + ((position - 1) / (totalPlayers - 1)) * chartH;
  }

  function pathD(positions: (number | null)[]): string {
    const segments: string[] = [];
    let started = false;
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      if (pos === null) { started = false; continue; }
      segments.push(`${started ? "L" : "M"}${x(i).toFixed(1)},${y(pos).toFixed(1)}`);
      started = true;
    }
    return segments.join(" ");
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Évolution du classement
      </p>
      <div className="scrollbar-none overflow-x-auto rounded-2xl border border-line bg-surface p-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[180px]"
          style={{ minWidth: width }}
        >
          {/* Grid lines */}
          {Array.from({ length: totalPlayers }, (_, i) => (
            <line
              key={i}
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={y(i + 1)}
              y2={y(i + 1)}
              stroke="var(--color-line)"
              strokeWidth={0.5}
            />
          ))}

          {/* Y labels (positions) */}
          {Array.from({ length: totalPlayers }, (_, i) => (
            <text
              key={i}
              x={PADDING.left - 8}
              y={y(i + 1) + 4}
              textAnchor="end"
              className="fill-ink-faint text-[10px]"
            >
              {i + 1}
            </text>
          ))}

          {/* X labels (round names) */}
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

          {/* Player lines */}
          {players.map((player, pi) => {
            const isViewer = player.userId === viewerId;
            const isHovered = hoveredPlayer === player.userId;
            const isActive = isViewer || isHovered;
            const dimmed = hoveredPlayer !== null && !isActive;
            const color = player.color || COLORS[pi % COLORS.length];

            return (
              <g
                key={player.userId}
                onPointerEnter={() => setHoveredPlayer(player.userId)}
                onPointerLeave={() => setHoveredPlayer(null)}
                style={{ cursor: "pointer" }}
              >
                <path
                  d={pathD(player.positions)}
                  fill="none"
                  stroke={color}
                  strokeWidth={isActive ? 3 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={dimmed ? 0.2 : 1}
                />
                {player.positions.map((pos, i) =>
                  pos !== null ? (
                    <circle
                      key={i}
                      cx={x(i)}
                      cy={y(pos)}
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

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-1">
        {players.map((player, pi) => {
          const color = player.color || COLORS[pi % COLORS.length];
          const isViewer = player.userId === viewerId;
          return (
            <button
              key={player.userId}
              type="button"
              onPointerEnter={() => setHoveredPlayer(player.userId)}
              onPointerLeave={() => setHoveredPlayer(null)}
              className={cn(
                "flex items-center gap-1.5 text-[11px] transition",
                isViewer ? "font-bold text-ink" : "text-ink-muted",
                hoveredPlayer !== null && hoveredPlayer !== player.userId && "opacity-30",
              )}
            >
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              {player.firstName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
