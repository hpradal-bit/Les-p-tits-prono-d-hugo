import type { Metadata } from "next";
import { Card, Label } from "@/components/ui";
import { loadCurrentRuleset, loadRulesetVersions } from "@/lib/admin/queries";
import { PointsForm } from "./_components/points-form";
import { LockForm } from "./_components/lock-form";
import { ExactScoreForm } from "./_components/exact-score-form";
import { BucketForm } from "./_components/bucket-form";

export const metadata: Metadata = { title: "Barème" };
export const dynamic = "force-dynamic";

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[19px] tracking-tight text-ink">{title}</h2>
        <p className="text-[13px] leading-relaxed text-ink-muted">{intro}</p>
      </div>
      {children}
    </Card>
  );
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "2-digit", timeZone: "Europe/Paris",
  });
}

export default async function AdminBaremePage() {
  const [ruleset, versions] = await Promise.all([
    loadCurrentRuleset(),
    loadRulesetVersions(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-sage/40 bg-sage-soft p-4">
        <p className="text-[14px] leading-relaxed text-ink">
          Rien n&apos;est écrit en dur : tout ce qui suit vit en base et se change
          ici. Chaque enregistrement rejoue la saison entière, donc le classement
          reflète toujours le barème en vigueur — jamais un mélange des deux.
        </p>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-sage">
          Version {ruleset.version}
        </p>
      </Card>

      <Section
        title="La cascade"
        intro="Le calcul retient le meilleur niveau atteint, du plus précis au moins précis."
      >
        <PointsForm ruleset={ruleset} />
      </Section>

      <Section
        title="Les tranches d'écart"
        intro="L'écart de points entre les deux équipes tombe dans une de ces tranches. Un score exact déduit sa tranche tout seul."
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <Label className="min-w-0 flex-1">Intitulé</Label>
            <Label className="w-20 text-center">De</Label>
            <span className="w-4" />
            <Label className="w-20 text-center">À</Label>
          </div>
          {ruleset.buckets.map((bucket) => (
            <BucketForm key={bucket.id} bucket={bucket} />
          ))}
          {ruleset.buckets.length === 0 && (
            <p className="text-[13.5px] text-ink-muted">
              Aucune tranche en base pour ce barème.
            </p>
          )}
        </div>
      </Section>

      <Section
        title="Le score exact"
        intro="Tenter un score exact ne fait jamais perdre de points : la tranche est déduite du pronostic."
      >
        <ExactScoreForm ruleset={ruleset} />
      </Section>

      <Section
        title="Le verrouillage"
        intro="Passé ce délai, plus personne ne touche à son pronostic — et les pronos des autres deviennent lisibles."
      >
        <LockForm ruleset={ruleset} />
      </Section>

      {versions.length > 1 && (
        <Section
          title="L'historique"
          intro="Chaque match est noté avec le barème en vigueur au moment où ses pronostics ont été verrouillés."
        >
          <ul className="flex flex-col gap-2">
            {versions.map((v) => (
              <li
                key={v.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  v.isCurrent ? "border-clay bg-clay-soft" : "border-line bg-surface-sunk"
                }`}
              >
                <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-ink-faint">
                  v{v.version}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-ink">
                    {v.label ?? "Barème initial"}
                  </span>
                  <span className="block font-mono text-[11px] text-ink-faint">
                    {formatDay(v.effectiveFrom)} →{" "}
                    {v.effectiveTo ? formatDay(v.effectiveTo) : "en cours"}
                  </span>
                </span>
                <span className="font-mono text-[12.5px] tabular text-ink-muted">
                  {v.points.wrong}/{v.points.winner}/{v.points.winner_and_margin}/
                  {v.points.exact_score}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
