import type { SupabaseClient } from "@supabase/supabase-js";
import { getPower } from "./registry.ts";
import { loadActivePowers, loadRoundUsages, loadFixtureScoresForRound, loadRoundTotals } from "./queries.ts";
import type { Power, PowerUsage, ResolveContext } from "./types.ts";
import type { Uuid } from "../types.ts";

/**
 * Écrit le résultat d'un pouvoir déjà résolu : ajustements de points, passage
 * à l'état "resolved", événement pour le Vestiaire.
 *
 * Extrait de `resolveRoundPowers` pour être partagé avec `resolveFixturePowers`
 * (résolution match par match) — un seul endroit écrit un résultat de pouvoir,
 * qu'il soit déclenché à la fin d'un match ou à la clôture de la journée.
 *
 * Idempotent par construction : n'est jamais appelé deux fois pour la même
 * utilisation, puisque les deux appelants ne lisent que les utilisations encore
 * à l'état "declared"/"accepted" (cf. `loadRoundUsages`) — une fois passée à
 * "resolved" ici, elle ne réapparaît plus dans aucune des deux requêtes.
 */
export async function applyResolution(
  admin: SupabaseClient,
  seasonId: Uuid,
  roundId: Uuid,
  usage: PowerUsage,
  power: Power,
  adminId: string | null,
): Promise<{ delta: number }> {
  const pk = getPower(power.code);
  if (!pk) return { delta: 0 };

  // Chargées ici plutôt que passées par l'appelant : un seul match résolu tout
  // de suite après la fin d'un autre n'a pas besoin de refaire tout le calcul
  // de la journée, mais chaque appel reste indépendant et correct isolément.
  const fixtureScores = await loadFixtureScoresForRound(admin, roundId);
  const roundTotals = await loadRoundTotals(admin, roundId);
  const ctx: ResolveContext = { usage, power, fixtureScores, roundTotals };
  const result = pk.resolve(ctx);

  for (const adj of result.adjustments) {
    if (adj.delta === 0) continue;
    await admin.from("point_adjustments").insert({
      user_id: adj.userId,
      season_id: seasonId,
      round_id: roundId,
      delta: adj.delta,
      reason: adj.reason,
      source: `power:${power.code}`,
      source_id: usage.id,
      created_by: adminId,
    });
  }

  await admin
    .from("power_usages")
    .update({
      state: "resolved",
      result: result.outcome,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", usage.id);

  // L'événement est émis même sans ajustement de points : l'Espion ne déplace
  // aucun point mais le Vestiaire doit quand même raconter qu'il a été utilisé.
  await admin.from("events").insert({
    kind: "power_resolved",
    season_id: seasonId,
    round_id: roundId,
    actor_id: usage.initiatorId,
    target_id: usage.targetId,
    payload: {
      power_code: power.code,
      power_emoji: power.emoji,
      power_name: power.name,
      outcome: result.outcome,
      delta: result.adjustments
        .filter((a) => a.userId === usage.initiatorId)
        .reduce((sum, a) => sum + a.delta, 0),
    },
  });

  return {
    delta: result.adjustments
      .filter((a) => a.userId === usage.initiatorId)
      .reduce((sum, a) => sum + a.delta, 0),
  };
}

/**
 * Résout, tout de suite, les pouvoirs dont l'effet est déjà connu dès qu'UN
 * match précis est terminé (`powers.config.resolves_at === "fixture_finished"`,
 * ex. Joker, Oracle, Sabotage) — sans attendre la clôture manuelle de toute
 * la journée.
 *
 * C'est le correctif du bug rapporté : avant, seule `resolveRoundPowers` (appelée
 * uniquement par la clôture admin de la journée) appliquait jamais un pouvoir,
 * alors que le score du pronostic, lui, est déjà calculé match par match par
 * `recomputeFixtures`. Un Joker sur un match terminé isolément n'avait donc
 * jamais d'effet tant que l'admin ne clôturait pas toute la journée.
 *
 * Les pouvoirs dont `resolves_at` vaut "round_settled" (Duel : a besoin du total
 * de la journée entière) restent réservés à `resolveRoundPowers`.
 */
export async function resolveFixturePowers(
  admin: SupabaseClient,
  fixtureId: Uuid,
  roundId: Uuid,
  seasonId: Uuid,
): Promise<{ resolved: number }> {
  const usages = await loadRoundUsages(admin, roundId);
  const active = usages.filter(
    (u) =>
      (u.state === "declared" || u.state === "accepted") &&
      u.snapshotBefore.fixtureId === fixtureId,
  );
  if (active.length === 0) return { resolved: 0 };

  const powers = await loadActivePowers(admin);
  const powerMap = new Map(powers.map((p) => [p.id, p]));

  let resolved = 0;
  for (const usage of active) {
    const power = powerMap.get(usage.powerId);
    if (!power) continue;
    // Seuls les pouvoirs explicitement configurés "fixture_finished" se
    // résolvent match par match ; les autres attendent la clôture de la
    // journée (cf. commentaire ci-dessus).
    if (power.config.resolves_at !== "fixture_finished") continue;

    await applyResolution(admin, seasonId, roundId, usage, power, null);
    resolved++;
  }

  return { resolved };
}
