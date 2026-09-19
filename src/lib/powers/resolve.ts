import type { SupabaseClient } from "@supabase/supabase-js";
import { getPower } from "./registry.ts";
import { loadActivePowers, loadRoundUsages, loadFixtureScoresForRound, loadRoundTotals } from "./queries.ts";
import type { Power, PowerUsage, ResolveContext } from "./types.ts";
import type { Uuid } from "../types.ts";

/**
 * Écrit le résultat d'un pouvoir : ajustements de points, passage à l'état
 * "resolved", événement pour le Vestiaire.
 *
 * Extrait de `resolveRoundPowers` pour être partagé avec `resolveFixturePowers`
 * (résolution match par match) — un seul endroit écrit un résultat de pouvoir,
 * qu'il soit déclenché à la fin d'un match ou à la clôture de la journée.
 *
 * Rejouable, comme le calcul des points (règle n° 2) : un pouvoir déjà
 * "resolved" peut être repassé ici si le score du match a changé depuis (score
 * corrigé depuis l'admin, recoupement tardif qui officialise un résultat) —
 * c'est la dernière lecture du score qui fait foi, jamais celle qui avait
 * cours au premier passage. Les ajustements précédents de cette utilisation
 * sont alors remplacés plutôt qu'accumulés, et rien n'est réécrit si le
 * nouveau calcul retombe exactement sur le même résultat.
 */
export async function applyResolution(
  admin: SupabaseClient,
  seasonId: Uuid,
  roundId: Uuid,
  usage: PowerUsage,
  power: Power,
  adminId: string | null,
): Promise<{ delta: number; changed: boolean }> {
  const pk = getPower(power.code);
  if (!pk) return { delta: 0, changed: false };

  // Chargées ici plutôt que passées par l'appelant : un seul match résolu tout
  // de suite après la fin d'un autre n'a pas besoin de refaire tout le calcul
  // de la journée, mais chaque appel reste indépendant et correct isolément.
  const fixtureScores = await loadFixtureScoresForRound(admin, roundId);
  const roundTotals = await loadRoundTotals(admin, roundId);
  const ctx: ResolveContext = { usage, power, fixtureScores, roundTotals };
  const result = pk.resolve(ctx);

  const source = `power:${power.code}`;
  const { data: previousRows } = await admin
    .from("point_adjustments")
    .select("id, user_id, delta")
    .eq("source", source)
    .eq("source_id", usage.id);
  const previous = (previousRows ?? []) as Array<{ id: string; user_id: string; delta: number }>;
  const previousByUser = new Map(previous.map((p) => [p.user_id, p.delta]));

  const nextAdjustments = result.adjustments.filter((adj) => adj.delta !== 0);
  const nextByUser = new Map(nextAdjustments.map((adj) => [adj.userId, adj.delta]));

  const changed =
    usage.state !== "resolved" ||
    previousByUser.size !== nextByUser.size ||
    [...previousByUser].some(([userId, delta]) => nextByUser.get(userId) !== delta);

  if (changed) {
    if (previous.length > 0) {
      await admin
        .from("point_adjustments")
        .delete()
        .in("id", previous.map((p) => p.id));
    }
    for (const adj of nextAdjustments) {
      await admin.from("point_adjustments").insert({
        user_id: adj.userId,
        season_id: seasonId,
        round_id: roundId,
        delta: adj.delta,
        reason: adj.reason,
        source,
        source_id: usage.id,
        created_by: adminId,
      });
    }
  }

  await admin
    .from("power_usages")
    .update({
      state: "resolved",
      result: result.outcome,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", usage.id);

  const actorDelta = result.adjustments
    .filter((a) => a.userId === usage.initiatorId)
    .reduce((sum, a) => sum + a.delta, 0);

  // L'événement est émis même sans ajustement de points : l'Espion ne déplace
  // aucun point mais le Vestiaire doit quand même raconter qu'il a été utilisé.
  // Un recalcul qui ne change rien n'émet rien de plus : rejouer un match déjà
  // noté ne doit pas inonder le fil d'un doublon.
  if (changed) {
    await admin.from("events").insert({
      kind: "power_resolved",
      season_id: seasonId,
      round_id: roundId,
      actor_id: usage.initiatorId,
      target_id: usage.targetId,
      payload: {
        usage_id: usage.id,
        power_code: power.code,
        power_emoji: power.emoji,
        power_name: power.name,
        outcome: result.outcome,
        delta: actorDelta,
      },
    });
  }

  return { delta: actorDelta, changed };
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
 *
 * Appelée à chaque fois que `recomputeFixtures` retraite ce match — donc
 * aussi bien à sa toute première fin qu'à une correction de score ultérieure
 * depuis l'admin. Un pouvoir déjà "resolved" sur ce match est donc repris ici
 * lui aussi : `applyResolution` ne le réécrit que si le nouveau calcul diffère
 * du précédent, jamais en double.
 */
export async function resolveFixturePowers(
  admin: SupabaseClient,
  fixtureId: Uuid,
  roundId: Uuid,
  seasonId: Uuid,
): Promise<{ resolved: number }> {
  const usages = await loadRoundUsages(admin, roundId);
  const relevant = usages.filter(
    (u) =>
      (u.state === "declared" || u.state === "accepted" || u.state === "resolved") &&
      u.snapshotBefore.fixtureId === fixtureId,
  );
  if (relevant.length === 0) return { resolved: 0 };

  const powers = await loadActivePowers(admin);
  const powerMap = new Map(powers.map((p) => [p.id, p]));

  let resolved = 0;
  for (const usage of relevant) {
    const power = powerMap.get(usage.powerId);
    if (!power) continue;
    // Seuls les pouvoirs explicitement configurés "fixture_finished" se
    // résolvent match par match ; les autres attendent la clôture de la
    // journée (cf. commentaire ci-dessus).
    if (power.config.resolves_at !== "fixture_finished") continue;

    const outcome = await applyResolution(admin, seasonId, roundId, usage, power, null);
    if (outcome.changed) resolved++;
  }

  return { resolved };
}

/**
 * Rattrape les pouvoirs restés « déclarés » alors que leur match est terminé
 * depuis longtemps.
 *
 * Trois cas l'imposaient au 17 septembre : deux pouvoirs posés sur des matchs
 * du 27 août, soit avant que la résolution match par match n'existe, et un
 * Duel en attente d'une clôture de journée qui n'est jamais venue. Dans les
 * trois cas le joueur avait dépensé ses crédits pour rien, sans que rien nulle
 * part ne le signale.
 *
 * Ne touche que les pouvoirs configurés `fixture_finished` : ceux qui attendent
 * la clôture de la journée doivent continuer à l'attendre, c'est leur règle.
 */
export async function sweepOrphanedPowers(
  admin: SupabaseClient,
): Promise<{ resolved: number; pending: string[] }> {
  const { data: rows, error } = await admin
    .from("power_usages")
    .select(
      "id, round_id, snapshot_before, state, powers!inner(config), rounds!inner(season_id)",
    )
    .in("state", ["declared", "accepted"]);
  if (error) throw error;

  const pending: string[] = [];
  const toResolve: Array<{ fixtureId: string; roundId: string; seasonId: string }> = [];

  for (const row of (rows ?? []) as Array<Record<string, unknown>>) {
    const snapshot = (row.snapshot_before ?? {}) as Record<string, unknown>;
    const fixtureId = snapshot.fixtureId as string | undefined;
    const power = (Array.isArray(row.powers) ? row.powers[0] : row.powers) as
      | { config: Record<string, unknown> }
      | undefined;
    const round = (Array.isArray(row.rounds) ? row.rounds[0] : row.rounds) as
      | { season_id: string }
      | undefined;

    // Sans match, le pouvoir attend la clôture de la journée : ce n'est pas un
    // orphelin, c'est son fonctionnement normal.
    if (!fixtureId || !round || power?.config?.resolves_at !== "fixture_finished") {
      pending.push(row.id as string);
      continue;
    }
    // La saison vient de la journée du pouvoir, **jamais** de la saison active :
    // un pouvoir posé sur une compétition de test doit rester dans sa
    // compétition. Prendre la saison active ici avait fait remonter deux points
    // de Pro D2 dans le classement du Top 14.
    toResolve.push({ fixtureId, roundId: row.round_id as string, seasonId: round.season_id });
  }

  if (toResolve.length === 0) return { resolved: 0, pending };

  // Le match est-il réellement terminé ? On ne résout jamais sur un match en
  // cours : le score n'est pas définitif.
  const { data: fixtures } = await admin
    .from("fixtures")
    .select("id, status")
    .in("id", toResolve.map((t) => t.fixtureId));

  const final = new Set(
    ((fixtures ?? []) as Array<{ id: string; status: string }>)
      .filter((f) => f.status === "finished" || f.status === "official")
      .map((f) => f.id),
  );

  let resolved = 0;
  for (const { fixtureId, roundId, seasonId } of toResolve) {
    if (!final.has(fixtureId)) continue;
    const outcome = await resolveFixturePowers(admin, fixtureId, roundId, seasonId);
    resolved += outcome.resolved;
  }

  return { resolved, pending };
}
