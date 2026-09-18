/**
 * Les squelettes d'attente.
 *
 * Sans eux, Next.js ne précharge pas une route dynamique — et comme tous les
 * écrans du jeu le sont, chaque changement d'onglet attendait le serveur,
 * écran figé sur la page précédente. Une frontière `loading.tsx` change deux
 * choses d'un coup : le lien est préchargé dès qu'il entre à l'écran, et le
 * passage est immédiat, forme de la page déjà en place.
 *
 * Ils imitent la silhouette du contenu, pas un sablier : le regard se pose au
 * bon endroit avant même que les données arrivent.
 */

import { cn } from "@/lib/cn";

export function Shimmer({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("block animate-pulse rounded-md bg-surface-sunk", className)}
    />
  );
}

/** L'en-tête d'un écran : sur-titre, titre. */
export function HeaderSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Shimmer className="h-2.5 w-28" />
      <Shimmer className="h-8 w-52" />
    </div>
  );
}

/** Une carte pleine, hauteur réglable. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <Shimmer className={cn("h-24 rounded-[var(--radius-card)]", className)} />
  );
}

/** Une liste de cartes — matchs, messages, joueurs. */
export function ListSkeleton({
  rows = 4,
  height = "h-24",
}: {
  rows?: number;
  height?: string;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <CardSkeleton key={i} className={height} />
      ))}
    </div>
  );
}

/** Le bandeau coloré des écrans qui en ont un (classement, match). */
export function BannerSkeleton() {
  return (
    <div className="-mx-4 flex flex-col gap-3 bg-sage px-6 pb-5 pt-4">
      <Shimmer className="h-2.5 w-24 bg-surface/30" />
      <Shimmer className="h-7 w-44 bg-surface/30" />
      <Shimmer className="h-20 w-full rounded-2xl bg-surface/20" />
    </div>
  );
}

/** La rangée d'onglets ou de segments. */
export function SegmentedSkeleton({ items = 3 }: { items?: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: items }, (_, i) => (
        <Shimmer key={i} className="h-9 flex-1 rounded-full" />
      ))}
    </div>
  );
}

/** La coquille commune : en-tête puis contenu. */
export function ScreenSkeleton({
  rows = 4,
  height,
  segments,
}: {
  rows?: number;
  height?: string;
  segments?: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <HeaderSkeleton />
      {segments ? <SegmentedSkeleton items={segments} /> : null}
      <ListSkeleton rows={rows} height={height} />
    </div>
  );
}
