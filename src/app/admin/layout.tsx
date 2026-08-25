import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewerContext } from "@/lib/admin/auth";
import { AdminNav } from "./_components/admin-nav";

export const dynamic = "force-dynamic";

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
        <AdminNav />
      </header>
      {children}
    </div>
  );
}
