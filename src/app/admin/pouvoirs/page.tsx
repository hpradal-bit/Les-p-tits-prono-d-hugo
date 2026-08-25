import type { Metadata } from "next";
import { Card, Label } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentSeasonId } from "@/lib/admin/queries";
import { loadAllPowers } from "@/lib/powers/queries";
import { PowerPanel, TokenGrantForm } from "./_components/power-panel";

export const metadata: Metadata = { title: "Pouvoirs — Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPowersPage() {
  const admin = createAdminClient();
  const seasonId = await currentSeasonId(admin);
  const powers = await loadAllPowers(admin);

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
      <section className="flex flex-col gap-3">
        <Label>Pouvoirs</Label>
        <Card className="p-4">
          <PowerPanel
            powers={powers.map((p) => ({
              id: p.id,
              code: p.code,
              name: p.name,
              emoji: p.emoji,
              isActive: p.isActive,
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
          <TokenGrantForm />
        </Card>
      </section>
    </div>
  );
}
