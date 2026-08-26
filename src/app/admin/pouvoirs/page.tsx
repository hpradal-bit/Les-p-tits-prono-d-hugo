import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Card, Label } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/lib/auth/session";
import { resolveLeagueId } from "@/lib/leagues/queries.ts";
import { loadActiveSeason } from "@/lib/standings/queries";
import { loadAllPowers } from "@/lib/powers/queries";
import { creditCost, FALLBACK_CREDIT_COST } from "@/lib/powers/credits";
import { loadSettings, setting } from "@/lib/settings";
import { PowerPanel, TokenGrantForm } from "./_components/power-panel";

export const metadata: Metadata = { title: "Pouvoirs — Admin" };
export const dynamic = "force-dynamic";

const params = z.object({ league: z.string().uuid().optional() });

export default async function AdminPowersPage({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const viewer = await requireViewer();
  const sb = await createClient();
  const { league: requested } = params.catch({}).parse(await searchParams);
  const resolved = await resolveLeagueId(sb, viewer.id, requested);
  if (!resolved) redirect("/accueil");
  const { leagueId, leagues: myLeagues } = resolved;

  const admin = createAdminClient();
  const season = await loadActiveSeason(admin, leagueId);
  if (!season) {
    return (
      <Card className="p-6 text-center">
        <p className="text-ink-muted">Aucune saison pour cette ligue.</p>
      </Card>
    );
  }
  const seasonId = season.id;
  const powers = await loadAllPowers(admin);
  const settings = await loadSettings(admin);
  const fallbackCost = setting<number>(
    settings,
    "powers.default_credit_cost",
    FALLBACK_CREDIT_COST,
  );

  const { data: tokenRows } = await admin
    .from("tokens")
    .select("status, user_id")
    .eq("season_id", seasonId);

  const tokens = (tokenRows ?? []) as Array<{ status: string; user_id: string }>;
  const available = tokens.filter((t) => t.status === "available").length;
  const used = tokens.filter((t) => t.status === "used").length;
  const uniquePlayers = new Set(tokens.map((t) => t.user_id)).size;

  return (
    <div className="flex flex-col gap-6">
      {myLeagues.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {myLeagues.map((l) => (
            <Link
              key={l.leagueId}
              href={`/admin/pouvoirs?league=${l.leagueId}`}
              className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                l.leagueId === leagueId
                  ? "bg-clay text-surface"
                  : "border border-line bg-surface text-ink-muted"
              }`}
            >
              {l.leagueName}
            </Link>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <Label>Pouvoirs · {season.competitionName}</Label>
        <Card className="p-4">
          <PowerPanel
            powers={powers.map((p) => ({
              id: p.id,
              code: p.code,
              name: p.name,
              emoji: p.emoji,
              isActive: p.isActive,
              cost: creditCost(p, fallbackCost),
            }))}
          />
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <Label>Tokens</Label>
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap gap-3 text-[13px]">
            <span className="rounded-full bg-winner-soft px-3 py-1 font-semibold text-winner">
              {available} disponible{available > 1 ? "s" : ""}
            </span>
            <span className="rounded-full bg-clay-soft px-3 py-1 font-semibold text-clay">
              {used} utilise{used > 1 ? "s" : ""}
            </span>
            <span className="rounded-full bg-sage-soft px-3 py-1 font-semibold text-sage">
              {uniquePlayers} joueur{uniquePlayers > 1 ? "s" : ""}
            </span>
          </div>
          <TokenGrantForm leagueId={leagueId} />
        </Card>
      </section>
    </div>
  );
}
