import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadActiveSeason } from "@/lib/standings/queries";
import { loadRuleset, loadSettings, setting } from "@/lib/settings";
import { getViewer } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Les règles" };
export const dynamic = "force-dynamic";

/** Les quatre niveaux, dans l'ordre de la cascade. Rien n'est écrit en dur :
 *  les points viennent du barème en vigueur. */
const LEVELS = [
  { key: "wrong", title: "Mauvais vainqueur", hint: "Tu t'es trompé de camp, on s'arrête là.", tone: "bg-wrong-soft text-wrong" },
  { key: "winner", title: "Bon vainqueur", hint: "Le bon camp, mais l'écart à côté.", tone: "bg-winner-soft text-winner" },
  { key: "winner_and_margin", title: "Bon vainqueur + bonne tranche", hint: "Le camp et la tranche d'écart.", tone: "bg-winner-soft text-winner" },
  { key: "exact_score", title: "Score exact", hint: "Les deux scores au point près.", tone: "bg-perfect-soft text-perfect" },
] as const;

function periodLabel(period: string) {
  return period === "round" ? "journée" : period === "month" ? "mois" : period === "season" ? "saison" : "match";
}

export default async function ReglesPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/connexion");

  const sb = await createClient();
  const season = await loadActiveSeason(sb);
  if (!season) redirect("/journee");

  const [ruleset, settings] = await Promise.all([
    loadRuleset(sb, season.id),
    loadSettings(sb),
  ]);

  const lockMinutes = ruleset.lock.minutesBeforeKickoff;
  const lockText =
    lockMinutes % 60 === 0
      ? `${lockMinutes / 60} heure${lockMinutes / 60 > 1 ? "s" : ""}`
      : `${lockMinutes} minutes`;

  const quota = ruleset.exactScore.quota;
  const defaultsOn = ruleset.defaultPrediction.enabled;
  const adminLogPublic = setting<boolean>(settings, "admin_log.public", true);

  return (
    <div className="flex flex-col gap-2.5">
      <header className="flex items-center gap-3">
        <Link
          href="/journee"
          aria-label="Retour"
          className="grid size-[38px] shrink-0 place-items-center rounded-full border border-line-strong text-ink-muted"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
          </svg>
        </Link>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-sage">
            Comment on joue
          </span>
          <h1 className="font-display text-[26px] leading-none text-ink">Les règles</h1>
        </div>
      </header>

      {/* La cascade */}
      <section className="rounded-[28px] bg-surface px-4.5 py-1.5 shadow-[var(--shadow-card)]">
        {LEVELS.map((level, i) => (
          <div
            key={level.key}
            className={`flex items-center gap-3.5 py-2.5 ${i < LEVELS.length - 1 ? "border-b border-line" : ""}`}
          >
            <span
              className={`tabular min-w-[52px] rounded-full py-1.5 text-center text-[15px] font-bold ${level.tone}`}
            >
              {ruleset.points[level.key]}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[15px] font-bold text-ink">{level.title}</span>
              <span className="text-[12px] text-ink-faint">{level.hint}</span>
            </div>
          </div>
        ))}
      </section>

      {/* La règle qui compte */}
      <section className="flex items-start gap-3 rounded-[28px] border border-clay/40 bg-clay-soft p-4">
        <svg className="mt-px shrink-0 text-clay" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75">
          <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" />
        </svg>
        <p className="text-[13px] leading-relaxed text-ink">
          Tenter un score exact ne peut <strong>jamais</strong> te faire perdre de points :
          si tu te rates, la tranche d&apos;écart est déduite de ton pronostic.
        </p>
      </section>

      {/* Les tranches */}
      <section className="flex flex-col gap-3 rounded-[28px] bg-surface p-4 shadow-[var(--shadow-card)]">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
          Les {ruleset.buckets.length} tranches d&apos;écart · réglables en admin
        </span>
        <p className="text-[14px] font-semibold leading-relaxed tracking-[0.01em] text-ink">
          {ruleset.buckets.map((b) => b.label).join(" · ")}
        </p>
      </section>

      {/* Le verrouillage */}
      <section className="flex flex-col gap-2.5 rounded-[28px] bg-sage-soft p-4">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-sage">
          Verrouillage
        </span>
        <p className="text-[13px] leading-relaxed text-ink">
          Les pronos se ferment <strong>{lockText}</strong> avant le coup d&apos;envoi — délai
          réglable en admin. Avant : personne ne voit rien. Après : tout le monde voit tout.
        </p>
      </section>

      {/* Le score exact et le filet */}
      <section className="flex items-center gap-3 rounded-[16px] bg-surface px-4 py-3 shadow-[var(--shadow-card)]">
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-[14px] font-bold text-ink">
            Score exact :{" "}
            {quota === null
              ? "autant que tu veux"
              : quota === 0
                ? "désactivé cette saison"
                : `${quota} par ${periodLabel(ruleset.exactScore.period)}`}
          </span>
          <span className="text-[12px] text-ink-faint">
            {defaultsOn
              ? "Oublié ? l'équipe à domicile est jouée pour toi"
              : "Oublié ? aucun point sur ce match"}
          </span>
        </div>
      </section>

      {adminLogPublic && (
        <p className="px-1 pb-2 text-center text-[12.5px] leading-relaxed text-ink-faint">
          Toute correction faite par l&apos;arbitre est inscrite au{" "}
          <Link href="/admin/journal" className="font-semibold text-clay underline">
            journal
          </Link>
          , visible de tous.
        </p>
      )}
    </div>
  );
}
