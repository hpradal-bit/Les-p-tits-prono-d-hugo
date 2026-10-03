import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadDuelBattle } from "@/lib/powers/battle-queries";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Le match en direct d'un Duel — points des deux joueurs sur la journée,
 * matchs restants, qui mène. Lue en polling par `DuelBattleModal` pendant que
 * la fenêtre est ouverte, donc toujours avec le client admin (jamais RLS) :
 * c'est tout le point — lire les points de l'ADVERSAIRE sur un match pas
 * encore officiel, que RLS (règle n° 3) interdit normalement à un client.
 * La vérification d'accès se fait donc ici, à la main : seuls les deux
 * joueurs du Duel (celui qui l'a déclaré, celui qui le reçoit) peuvent lire
 * cette route, jamais un tiers.
 */
export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  first_name: string;
  display_name: string;
  avatar_kind: "emoji" | "photo" | "club";
  avatar_value: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ usageId: string }> },
) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Session expirée." }, { status: 401 });

  const limited = rateLimit(`powers:duel:${viewer.id}`, { limit: 60, windowMs: 60_000 });
  if (!limited.ok) return rateLimitResponse(limited);

  const { usageId } = await params;
  const admin = createAdminClient();

  const { data: usageRow, error: usageError } = await admin
    .from("power_usages")
    .select("id, initiator_id, target_id, round_id, powers!inner(code, emoji, name)")
    .eq("id", usageId)
    .maybeSingle();
  if (usageError) throw usageError;
  if (!usageRow) return NextResponse.json({ error: "Pouvoir introuvable." }, { status: 404 });

  const power = Array.isArray(usageRow.powers) ? usageRow.powers[0] : usageRow.powers;
  if (!power || power.code !== "duel") {
    return NextResponse.json({ error: "Pas un Duel." }, { status: 400 });
  }

  const initiatorId = usageRow.initiator_id as string;
  const targetId = usageRow.target_id as string | null;
  if (!targetId) return NextResponse.json({ error: "Duel sans adversaire." }, { status: 400 });

  // Seuls les deux belligérants peuvent consulter leur propre match — jamais
  // un troisième joueur, qui lirait sinon les points d'autrui sans y être
  // partie (même garde-fou que pour `loadSpyReveal`).
  if (viewer.id !== initiatorId && viewer.id !== targetId) {
    return NextResponse.json({ error: "Ce Duel ne te concerne pas." }, { status: 403 });
  }

  const { data: round, error: roundError } = await admin
    .from("rounds")
    .select("id, number, name, season_id")
    .eq("id", usageRow.round_id as string)
    .maybeSingle();
  if (roundError) throw roundError;
  if (!round) return NextResponse.json({ error: "Journée introuvable." }, { status: 404 });

  const [battle, profilesRes] = await Promise.all([
    loadDuelBattle(
      admin,
      round.season_id as string,
      usageRow.round_id as string,
      initiatorId,
      targetId,
    ),
    admin
      .from("profiles")
      .select("id, first_name, display_name, avatar_kind, avatar_value")
      .in("id", [initiatorId, targetId]),
  ]);
  if (profilesRes.error) throw profilesRes.error;

  const profiles = new Map(
    ((profilesRes.data ?? []) as ProfileRow[]).map((p) => [p.id, p]),
  );

  function playerPayload(userId: string) {
    const p = profiles.get(userId);
    return {
      userId,
      firstName: p?.first_name ?? "Joueur",
      displayName: p?.display_name ?? p?.first_name ?? "Joueur",
      avatarKind: p?.avatar_kind ?? "emoji",
      avatarValue: p?.avatar_value ?? "🏉",
    };
  }

  return NextResponse.json(
    {
      roundName: round.name as string,
      roundNumber: round.number as number,
      powerEmoji: power.emoji as string,
      powerName: power.name as string,
      initiator: playerPayload(initiatorId),
      target: playerPayload(targetId),
      initiatorPoints: battle.initiatorPoints,
      targetPoints: battle.targetPoints,
      totalFixtures: battle.totalFixtures,
      playedFixtures: battle.playedFixtures,
      remainingFixtures: battle.remainingFixtures,
      tie: battle.tie,
      leaderId: battle.leaderId,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
