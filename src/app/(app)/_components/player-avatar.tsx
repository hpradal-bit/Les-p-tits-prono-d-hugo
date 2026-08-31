/**
 * Avatar d'un joueur : emoji, photo, ou logo du club choisi.
 * Composant serveur, sans état : il ne fait que rendre `avatar_kind` /
 * `avatar_value` tels qu'ils sont stockés dans `profiles`, via la même
 * fonction pure `resolveAvatar()` que l'écran de choix d'avatar à
 * l'inscription — un seul endroit décide de ce qu'un avatar affiche.
 *
 * `clubs` est optionnel pour ne jamais casser un appelant qui ne l'aurait
 * pas encore : sans elle, un avatar « club » retombe sur ses initiales.
 */

import Image from "next/image";
import { cn } from "@/lib/cn";
import { resolveAvatar, type ClubAvatar } from "@/lib/auth/avatars";
import type { PlayerRef } from "@/lib/standings/engine";

export function PlayerAvatar({
  player,
  clubs = [],
  size = 40,
  className,
}: {
  player: PlayerRef;
  clubs?: readonly ClubAvatar[];
  size?: number;
  className?: string;
}) {
  const shared = cn(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
    "border border-line bg-surface-sunk",
    className,
  );

  const avatar = resolveAvatar(player.avatarKind, player.avatarValue, clubs);

  if (avatar.type === "image") {
    // Une photo perso mérite un texte alternatif nominatif plutôt que le
    // générique renvoyé par `resolveAvatar` (qui n'a pas le prénom sous la main).
    const alt = player.avatarKind === "photo" ? player.firstName : avatar.alt;
    return (
      <Image
        src={avatar.src}
        alt={alt}
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
      {isClub ? player.avatarValue.slice(0, 3).toUpperCase() : avatar.emoji}
    </span>
  );
}
