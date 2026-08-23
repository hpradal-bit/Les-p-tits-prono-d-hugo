/**
 * Avatar d'un joueur : emoji, photo, ou code d'un club.
 * Composant serveur, sans état : il ne fait que rendre `avatar_kind` /
 * `avatar_value` tels qu'ils sont stockés dans `profiles`.
 */

import Image from "next/image";
import { cn } from "@/lib/cn";
import type { PlayerRef } from "@/lib/standings/engine";

export function PlayerAvatar({
  player,
  size = 40,
  className,
}: {
  player: PlayerRef;
  size?: number;
  className?: string;
}) {
  const shared = cn(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
    "border border-line bg-surface-sunk",
    className,
  );

  if (player.avatarKind === "photo" && player.avatarValue) {
    return (
      <Image
        src={player.avatarValue}
        alt={player.firstName}
        width={size}
        height={size}
        className={cn(shared, "object-cover")}
        style={{ width: size, height: size }}
      />
    );
  }

  const isClub = player.avatarKind === "club";
  return (
    <span
      aria-hidden
      className={cn(shared, isClub ? "font-display" : "")}
      style={{ width: size, height: size, fontSize: size * (isClub ? 0.34 : 0.5) }}
    >
      {isClub ? player.avatarValue.slice(0, 3).toUpperCase() : player.avatarValue || "🏉"}
    </span>
  );
}
