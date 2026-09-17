import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Card, Label } from "@/components/ui";
import { LeagueSwitcher } from "@/components/league-switcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/lib/auth/session";
import { resolveLeagueId } from "@/lib/leagues/queries.ts";
import { loadActiveSeason } from "@/lib/standings/queries";
import { loadAllPowers, loadSeasonUsageByPlayer } from "@/lib/powers/queries";
import { maxUses, FALLBACK_MAX_USES } from "@/lib/powers/quota";
import { loadSettings, setting } from "@/lib/settings";
import { PowerPanel } from "./_components/power-panel";
import { buildPowerCounters } from "@/lib/powers/counters.ts";

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
  const fallbackMax = setting<number>(
    settings,
    "powers.max_uses_per_player",
    FALLBACK_MAX_USES,
  );

  // L'etat reel des quotas, joueur par joueur : ce que l'admin doit voir
  // avant de rehausser un plafond.
  const { data: memberRows } = await admin
    .from("league_members")
    .select("profiles!inner(id, first_name)")
    .eq("league_id", leagueId);
  const members: Array<{ userId: string; firstName: string }> = [];
  for (const row of (memberRows ?? []) as Array<Record<string, unknown>>) {
    const profile = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as
      | { id: string; first_name: string }
      | undefined;
    if (profile) members.push({ userId: profile.id, firstName: profile.first_name });
  }
  const usage = await loadSeasonUsageByPlayer(admin, seasonId);
  const counters = buildPowerCounters(members, powers, usage, fallbackMax);

  return (
    <div className="flex flex-col gap-6">
      <LeagueSwitcher
        options={myLeagues.map((l) => ({
          value: l.leagueId,
          label: l.leagueName,
          href: `/admin/pouvoirs?league=${l.leagueId}`,
        }))}
        current={leagueId}
      />

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
              maxUses: maxUses(p, fallbackMax),
            }))}
          />
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <Label>Quotas consommes</Label>
        <Card className="flex flex-col gap-2 p-4">
          {counters.length === 0 ? (
            <p className="text-[13px] text-ink-muted">Aucun joueur dans cette ligue.</p>
          ) : (
            counters.map((row) => (
              <div key={row.userId} className="flex flex-wrap items-center gap-2">
                <span className="min-w-[90px] text-[13px] font-semibold text-ink">
                  {row.firstName}
                </span>
                {row.cells.map((cell) => (
                  <span
                    key={cell.powerId}
                    title={cell.name}
                    className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold ${
                      cell.exhausted
                        ? "bg-surface-sunk text-ink-faint"
                        : "bg-clay-soft text-clay"
                    }`}
                  >
                    {cell.emoji} {cell.used}/{cell.max}
                  </span>
                ))}
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}
