export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-pine">
          Top 14 · Saison 2026/2027
        </p>
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-ink">
          Les p&apos;tits pronos d&apos;Hugo
        </h1>
        <p className="text-ink-muted">
          Vague 0 en place : base de données, design system et socle de l&apos;application.
          Les écrans de jeu arrivent en vague 1.
        </p>
      </header>

      <section
        aria-label="Code couleur des pronostics"
        className="rounded-[var(--radius-card)] border border-line bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
          Code couleur
        </p>
        <ul className="flex flex-col gap-3">
          {[
            { label: "Mauvais pronostic", pts: "0", bg: "bg-wrong-soft", fg: "text-wrong" },
            { label: "Bon vainqueur", pts: "1", bg: "bg-winner-soft", fg: "text-winner" },
            { label: "Bon vainqueur + bon écart", pts: "3", bg: "bg-winner-soft", fg: "text-winner" },
            { label: "Score exact", pts: "10", bg: "bg-perfect-soft", fg: "text-perfect" },
          ].map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-4">
              <span className="text-sm text-ink">{row.label}</span>
              <span
                className={`tabular rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold ${row.bg} ${row.fg}`}
              >
                {row.pts} pt{row.pts === "1" || row.pts === "0" ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="font-mono text-[11px] leading-relaxed text-ink-faint">
        J1 : samedi 5 septembre 2026
      </p>
    </main>
  );
}
