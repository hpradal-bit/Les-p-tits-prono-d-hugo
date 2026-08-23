import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewerContext } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

const TABS = [
  { href: "/admin/matchs", label: "Matchs" },
  { href: "/admin/bareme", label: "Barème" },
  { href: "/admin/joueurs", label: "Joueurs" },
  { href: "/admin/journal", label: "Journal" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Le rôle est relu en base à chaque affichage, jamais pris dans le jeton.
  const ctx = await getViewerContext();
  if (!ctx) redirect("/connexion");
  if (!ctx.isAdmin) redirect("/journee");

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 pb-28 pt-8">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-sage">
          Administration
        </p>
        <h1 className="font-display text-2xl tracking-tight text-ink">
          Les commandes
        </h1>
        <nav className="flex gap-2">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink hover:bg-surface-sunk"
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
