"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/admin/matchs", label: "Matchs" },
  { href: "/admin/synchronisation", label: "Synchro" },
  { href: "/admin/bareme", label: "Barème" },
  { href: "/admin/bonus", label: "Bonus" },
  { href: "/admin/pouvoirs", label: "Pouvoirs" },
  { href: "/admin/joueurs", label: "Joueurs" },
  { href: "/admin/push-settings", label: "Notifications" },
  { href: "/admin/journal", label: "Journal" },
];

export function AdminNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition",
              active
                ? "bg-sage text-surface"
                : "border border-line bg-surface text-ink hover:bg-surface-sunk",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
