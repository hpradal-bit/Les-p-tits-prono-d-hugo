import type { Metadata } from "next";
import { Card, Label } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentSeasonId } from "@/lib/admin/queries";
import { loadAllBadges, loadPlayerBadges } from "@/lib/badges/queries";
import type { BadgeRule } from "@/lib/badges/types";

export const metadata: Metadata = { title: "Badges — Admin" };
export const dynamic = "force-dynamic";

function ruleLabel(rule: BadgeRule): string {
  const kind = KIND_LABELS[rule.kind ?? ""] ?? rule.kind ?? "?";
  if (rule.type === "streak" || rule.type === "count") {
    return `${rule.threshold ?? "?"} × ${kind}`;
  }
  if (rule.type === "superlative") {
    return `Meilleur ${kind}`;
  }
  return `${rule.type} / ${kind}`;
}

const KIND_LABELS: Record<string, string> = {
  good_prediction: "bons pronos d'affilée",
  bad_prediction: "mauvais pronos d'affilée",
  exact_score: "scores exacts",
  round_won: "journées en tête",
  biggest_climb: "remontée de la journée",
};

const TYPE_LABELS: Record<string, string> = {
  streak: "Série",
  count: "Compteur",
  superlative: "Superlatif",
};

export default async function AdminBadgesPage() {
  const admin = createAdminClient();
  const seasonId = await currentSeasonId(admin);
  const [badges, playerBadges] = await Promise.all([
    loadAllBadges(admin),
    loadPlayerBadges(admin, seasonId),
  ]);

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name")
    .eq("is_active", true);
  const nameMap = new Map(
    ((profiles ?? []) as Array<{ id: string; display_name: string }>).map((p) => [
      p.id,
      p.display_name,
    ]),
  );

  const earnedCount = new Map<string, number>();
  for (const [, list] of playerBadges) {
    for (const b of list) {
      earnedCount.set(b.badgeId, (earnedCount.get(b.badgeId) ?? 0) + 1);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <Label>Badges de la saison</Label>
        <Card className="divide-y divide-line">
          {badges.map((b) => (
            <div key={b.id} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 text-2xl" aria-hidden>
                {b.emoji}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{b.name}</span>
                  <span className="rounded-full bg-surface-sunk px-2 py-0.5 font-mono text-[10px] text-ink-faint">
                    {b.code}
                  </span>
                  {!b.isActive && (
                    <span className="rounded-full bg-wrong-soft px-2 py-0.5 text-[10px] font-semibold text-wrong">
                      inactif
                    </span>
                  )}
                </div>
                {b.description && (
                  <p className="text-[13px] text-ink-muted">{b.description}</p>
                )}
                <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full bg-sage-soft px-2 py-0.5 font-semibold text-sage">
                    {TYPE_LABELS[b.rule.type] ?? b.rule.type}
                  </span>
                  <span className="rounded-full bg-clay-soft px-2 py-0.5 font-semibold text-clay">
                    {ruleLabel(b.rule)}
                  </span>
                  <span className="rounded-full bg-winner-soft px-2 py-0.5 font-semibold text-winner">
                    {earnedCount.get(b.id) ?? 0} décerné{(earnedCount.get(b.id) ?? 0) > 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </Card>
      </section>

      {playerBadges.size > 0 && (
        <section className="flex flex-col gap-3">
          <Label>Badges décernés</Label>
          <Card className="divide-y divide-line">
            {[...playerBadges.entries()].map(([userId, list]) => (
              <div key={userId} className="flex flex-col gap-1.5 px-4 py-3">
                <span className="text-[13px] font-semibold text-ink">
                  {nameMap.get(userId) ?? userId}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((b) => (
                    <span
                      key={b.badgeId}
                      title={`${b.name} — ${b.description ?? ""}`}
                      className="inline-flex items-center gap-1 rounded-full bg-surface-sunk px-2.5 py-1 text-[12px] font-semibold text-ink-muted"
                    >
                      <span aria-hidden>{b.emoji}</span>
                      {b.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
