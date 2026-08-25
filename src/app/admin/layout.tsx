import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewerContext } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

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

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getViewerContext();
  if (!ctx) redirect("/connexion");
  if (!ctx.isAdmin) redirect("/journee");

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 pb-8 pt-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-sage">
            Administration
          </p>
          <Link
            href="/journee"
            className="rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-semibold text-ink-muted hover:bg-surface-sunk"
          >
            Retour au jeu
          </Link>
        </div>
        <h1 className="font-display text-2xl tracking-tight text-ink">
          Les commandes
        </h1>
        <nav className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink hover:bg-surface-sunk"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
