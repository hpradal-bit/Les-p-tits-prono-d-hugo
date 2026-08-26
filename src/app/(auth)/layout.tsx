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
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-clay"
        >
          Des potes, des pronos, du kiff
        </Link>
        <p className="font-display text-[32px] leading-none tracking-tight text-ink">
          LE VESTIAIRE
        </p>
      </header>

      <main className="flex flex-1 flex-col justify-center">{children}</main>
    </div>
  );
}
