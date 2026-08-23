import type { Metadata } from "next";
import Link from "next/link";
import { InstallerGuide } from "./installer-guide";

export const metadata: Metadata = { title: "Installer l'app" };

export default function InstallerPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-8">
      <header className="flex flex-col gap-1">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-clay">
          Trois étapes
        </span>
        <h1 className="font-display text-[28px] leading-tight text-ink">
          Mets les pronos sur ton écran d&apos;accueil
        </h1>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-muted">
          L&apos;app s&apos;ouvre alors comme une vraie application, sans barre d&apos;adresse,
          et peut te rappeler de jouer avant le verrouillage.
        </p>
      </header>

      <InstallerGuide />

      <Link
        href="/journee"
        className="mt-2 rounded-full border border-line-strong py-3.5 text-center text-[15px] font-bold text-ink"
      >
        Retour aux pronos
      </Link>
    </div>
  );
}
