import Image from "next/image";
import { cn } from "@/lib/cn";
import type { ScoreLevel, Team } from "@/lib/types";

/* ---------------------------------------------------------------------------
   Primitives du design system. À utiliser telles quelles : ne pas réinventer
   un bouton ou une carte dans son coin, sinon l'application partira en morceaux.
   --------------------------------------------------------------------------- */

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint", className)}>
      {children}
    </p>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
  size?: "md" | "sm";
};

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition",
        "disabled:cursor-not-allowed disabled:opacity-45",
        size === "md" ? "px-5 py-3 text-[15px]" : "px-3.5 py-1.5 text-[13px]",
        variant === "primary" && "bg-clay text-white hover:brightness-110 active:brightness-95",
        variant === "ghost" && "border border-line bg-surface text-ink hover:bg-surface-sunk",
        variant === "danger" && "bg-wrong text-white hover:brightness-110",
        className,
      )}
      {...props}
    />
  );
}

/** Le code couleur du jeu : 🔴 raté · 🟢 bon vainqueur · 👌 score exact. */
export const LEVEL_STYLE: Record<ScoreLevel, { bg: string; fg: string; emoji: string; label: string }> = {
  wrong:             { bg: "bg-wrong-soft",   fg: "text-wrong",   emoji: "🔴", label: "Raté" },
  winner:            { bg: "bg-winner-soft",  fg: "text-winner",  emoji: "🟢", label: "Bon vainqueur" },
  winner_and_margin: { bg: "bg-winner-soft",  fg: "text-winner",  emoji: "🟢", label: "Vainqueur + écart" },
  exact_score:       { bg: "bg-perfect-soft", fg: "text-perfect", emoji: "👌", label: "Score exact" },
};

export function ScorePill({ level, points }: { level: ScoreLevel; points: number }) {
  const s = LEVEL_STYLE[level];
  return (
    <span
      title={s.label}
      className={cn(
        "tabular inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
        "font-mono text-xs font-semibold",
        s.bg,
        s.fg,
      )}
    >
      <span aria-hidden>{s.emoji}</span>
      {points > 0 ? `+${points}` : points}
    </span>
  );
}

/** Logo du club, avec repli en monogramme aux couleurs du club. */
export function TeamLogo({ team, size = 32 }: { team: Team; size?: number }) {
  if (team.logoUrl) {
    return (
      <Image
        src={team.logoUrl}
        alt={team.name}
        width={size}
        height={size}
        className="object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-label={team.name}
      className="inline-flex items-center justify-center rounded-full font-display"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: team.primaryColor ?? "var(--surface-sunk)",
        color: team.secondaryColor ?? "var(--ink)",
      }}
    >
      {team.code.slice(0, 3)}
    </span>
  );
}

/** Le logo d'une compétition (Top 14, Pro D2…) — jamais d'emoji ni d'initiales à défaut. */
export function CompetitionLogo({
  name,
  logoUrl,
  size = 32,
}: {
  name: string;
  logoUrl: string | null | undefined;
  size?: number;
}) {
  if (!logoUrl) return null;
  return (
    <Image
      src={logoUrl}
      alt={name}
      width={size}
      height={size}
      className="object-contain"
      style={{ width: size, height: size }}
    />
  );
}

export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-live-soft px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-live">
      <span className="size-1.5 rounded-full bg-live" aria-hidden />
      Live
    </span>
  );
}
