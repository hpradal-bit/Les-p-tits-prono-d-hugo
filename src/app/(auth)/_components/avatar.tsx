import { cn } from "@/lib/cn";
import { resolveAvatar, type ClubAvatar } from "@/lib/auth/avatars";

/**
 * Pastille d'avatar. Trois formes possibles derrière une seule apparence :
 * emoji, logo de club, ou photo téléversée.
 *
 * Volontairement en `<img>` plutôt qu'en `next/image` : la source peut être une
 * URL Supabase Storage, dont le domaine varie d'un environnement à l'autre.
 * L'inscrire dans `next.config.ts` reviendrait à modifier un fichier partagé
 * par tous les chantiers pour une image de 40 pixels.
 */
export function Avatar({
  kind,
  value,
  clubs = [],
  size = 40,
  className,
}: {
  kind: string;
  value: string;
  clubs?: readonly ClubAvatar[];
  size?: number;
  className?: string;
}) {
  const avatar = resolveAvatar(kind, value, clubs);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "border border-line bg-surface-sunk",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {avatar.type === "emoji" ? (
        <span aria-hidden style={{ fontSize: size * 0.5, lineHeight: 1 }}>
          {avatar.emoji}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar.src}
          alt={avatar.alt}
          width={size}
          height={size}
          className="size-full object-cover"
        />
      )}
    </span>
  );
}
