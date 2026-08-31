"use client";

/**
 * Navigation principale de l'application (chantier D).
 *
 * Barre inférieure, pensée pour le pouce sur mobile : c'est la seule
 * navigation de l'application. L'onglet Admin n'apparaît que pour les
 * administrateurs — et ce n'est qu'un confort d'affichage : la protection
 * réelle est côté serveur et dans les politiques RLS.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

interface Tab {
  href: string;
  label: string;
  /** Préfixes d'URL qui allument cet onglet. */
  matches: string[];
  icon: (props: { className?: string }) => React.ReactElement;
}

function IconBall({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <ellipse
        cx="12"
        cy="12"
        rx="9.5"
        ry="6"
        transform="rotate(-45 12 12)"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M9 15l6-6M10.5 13.5l1.2 1.2M13.5 10.5l1.2 1.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconResults({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M6 3.5h9.5L19 7v13.5H6V3.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M15.5 3.5V7H19" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8.5 12h7M8.5 15h7M8.5 9h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconTrophy({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M7 4h10v5a5 5 0 0 1-10 0V4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7 5.5H4.5V7a3 3 0 0 0 3 3M17 5.5h2.5V7a3 3 0 0 1-3 3M12 14v3.5M8.5 20h7M9.5 20l.6-2.5h3.8l.6 2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChat({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.4A.5.5 0 0 1 5 19v-3H6.5A2.5 2.5 0 0 1 4 13.5v-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUser({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="8.5" r="3.75" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4.75 19.5c.9-3.4 3.7-5.25 7.25-5.25s6.35 1.85 7.25 5.25"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconShield({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 3.5 19 6v6c0 4-2.9 7.2-7 8.5-4.1-1.3-7-4.5-7-8.5V6l7-2.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const PLAYER_TABS: Tab[] = [
  { href: "/journee", label: "Mes pronos", matches: ["/journee"], icon: IconBall },
  { href: "/resultats", label: "Résultats", matches: ["/resultats", "/match"], icon: IconResults },
  { href: "/classement", label: "Classement", matches: ["/classement"], icon: IconTrophy },
  { href: "/vestiaire", label: "Chambrage", matches: ["/vestiaire"], icon: IconChat },
  { href: "/profil", label: "Profil", matches: ["/profil", "/reglages", "/questions"], icon: IconUser },
];

const ADMIN_TAB: Tab = {
  href: "/admin",
  label: "Admin",
  matches: ["/admin"],
  icon: IconShield,
};

function isActive(pathname: string, tab: Tab) {
  return tab.matches.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname() ?? "";
  const tabs = isAdmin ? [...PLAYER_TABS, ADMIN_TAB] : PLAYER_TABS;

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex w-full max-w-2xl items-stretch">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-center transition",
                  active ? "text-clay" : "text-ink-faint hover:text-ink-muted",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition",
                    active && "bg-clay-soft",
                  )}
                >
                  <Icon className="size-[22px]" />
                </span>
                <span
                  className={cn(
                    "text-[11px] leading-none",
                    active ? "font-semibold" : "font-medium",
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
