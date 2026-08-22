import Link from "next/link";

/**
 * Coquille des écrans de compte : connexion, inscription, mot de passe, profil.
 * Une colonne étroite, centrée, lisible d'une main dans le train.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-pine"
        >
          Top 14 · Saison 2026/2027
        </Link>
        <p className="font-display text-2xl font-extrabold leading-tight tracking-tight text-ink">
          Les p&apos;tits pronos d&apos;Hugo
        </p>
      </header>

      <main className="flex flex-1 flex-col justify-center">{children}</main>
    </div>
  );
}
