/**
 * Le détail d'un match terminé : qui avait parié quoi, ce que ça a rapporté,
 * et quel super-pouvoir est venu s'y greffer.
 *
 * Deux moitiés, comme partout : `buildFixtureBreakdown` est pure et testable,
 * `loadFixtureBreakdowns` va chercher la matière en une passe pour toute une
 * journée — sept matchs ne doivent pas coûter sept séries de requêtes.
 *
 * Rien n'est recalculé ici : les points viennent de `prediction_scores` et de
 * `point_adjustments`, écrits par le serveur. L'écran ne fait que lire.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { levelFromBreakdown, parseBreakdown } from "../standings/breakdown.ts";
import type { ScoreLevel, Uuid } from "@/lib/types";

export type Outcome = "home" | "draw" | "away";

export interface RawPrediction {
  fixtureId: string;
  userId: string;
  outcome: Outcome;
  marginBucketId: string | null;
  exactHomeScore: number | null;
  exactAwayScore: number | null;
  isAuto: boolean;
  points: number | null;
  level: ScoreLevel | null;
}

export interface RawPowerUse {
  usageId: string;
  fixtureId: string;
  actorId: string;
  targetId: string | null;
  emoji: string;
  powerName: string;
  /** Somme des ajustements liés à cette utilisation, par joueur. */
  deltaByUser: Map<string, number>;
}

export interface BreakdownPlayer {
  userId: string;
  /** Le surnom, tel qu'il s'affiche au classement. */
  name: string;
  /** « Toulouse · 24–20 », « Nul », ou « Non parié », déjà mis en forme. */
  label: string;
  points: number | null;
  level: ScoreLevel | null;
  isAuto: boolean;
  /**
   * Vrai pour un joueur de la ligue qui n'a rien pronostiqué sur ce match.
   *
   * Il reste dans la liste plutôt que d'en disparaître silencieusement :
   * sans lui, un joueur qui ne joue pas semble n'avoir jamais existé sur ce
   * match, alors qu'il a bien un historique — celui de n'avoir rien joué, à
   * zéro point, comme n'importe quel autre score.
   */
  missing: boolean;
  /**
   * Ce qu'un pouvoir a changé pour CE joueur sur CE match (Sabotage reçu,
   * Duel gagné...). `points` reste le pronostic brut, non touché : c'est ce
   * qui a été joué. `pointAdjustment` est ce qui s'y ajoute une fois le
   * pouvoir résolu — l'écran barre le brut et affiche le net à côté plutôt
   * que de les confondre en un seul nombre.
   */
  pointAdjustment: number;
}

export interface BreakdownPower {
  usageId: string;
  emoji: string;
  powerName: string;
  actorName: string;
  targetName: string | null;
  /** Ce que le pouvoir a rapporté (ou coûté) à celui qui l'a posé. */
  actorDelta: number;
  /** Ce qu'il a coûté à sa cible — le Sabotage, essentiellement. */
  targetDelta: number | null;
}

export interface FixtureBreakdown {
  fixtureId: string;
  players: BreakdownPlayer[];
  powers: BreakdownPower[];
}

export interface TeamLabels {
  home: string;
  away: string;
}

/** « Toulouse · 24–20 », « Nul », « Bayonne · écart 1-7 ». */
export function predictionLabel(
  prediction: RawPrediction,
  teams: TeamLabels,
  bucketLabels: Map<string, string>,
): string {
  const side =
    prediction.outcome === "home"
      ? teams.home
      : prediction.outcome === "away"
        ? teams.away
        : "Nul";
  if (prediction.exactHomeScore !== null && prediction.exactAwayScore !== null) {
    return `${side} · ${prediction.exactHomeScore}–${prediction.exactAwayScore}`;
  }
  const bucket = prediction.marginBucketId ? bucketLabels.get(prediction.marginBucketId) : null;
  return bucket ? `${side} · écart ${bucket}` : side;
}

/** Le point brut, ajusté par les pouvoirs — `null` tant qu'il n'y a rien à noter. */
export function netPoints(player: BreakdownPlayer): number | null {
  return player.points === null ? null : player.points + player.pointAdjustment;
}

export function buildFixtureBreakdown(
  fixtureId: string,
  predictions: RawPrediction[],
  powerUses: RawPowerUse[],
  names: Map<string, string>,
  teams: TeamLabels,
  bucketLabels: Map<string, string>,
): FixtureBreakdown {
  // `names` porte le trousseau de LA ligue concernée (voir plus bas) : un
  // pronostic d'un compte hors ligue (un compte de test, par exemple) n'a
  // rien à faire ici et en disparaît complètement plutôt que de s'afficher
  // sous un nom générique.
  const predicted = predictions.filter((p) => p.fixtureId === fixtureId && names.has(p.userId));
  const predictedIds = new Set(predicted.map((p) => p.userId));

  // Ce que les pouvoirs posés sur CE match ont changé, par joueur touché —
  // qu'il en soit l'auteur (Duel gagné) ou la cible (Sabotage reçu). Calculé
  // une fois, avant les lignes, pour que chacune porte son propre écart.
  const adjustmentByUser = new Map<string, number>();
  for (const use of powerUses) {
    if (use.fixtureId !== fixtureId) continue;
    for (const [userId, delta] of use.deltaByUser) {
      adjustmentByUser.set(userId, (adjustmentByUser.get(userId) ?? 0) + delta);
    }
  }

  const scored: BreakdownPlayer[] = predicted.map((p) => ({
    userId: p.userId,
    name: names.get(p.userId) ?? "Joueur",
    label: predictionLabel(p, teams, bucketLabels),
    points: p.points,
    level: p.level,
    isAuto: p.isAuto,
    missing: false,
    pointAdjustment: adjustmentByUser.get(p.userId) ?? 0,
  }));

  // `names` porte tous les joueurs de la ligue (c'est ce que l'appelant y
  // met) : quiconque n'a pas prédit ce match apparaît quand même, à zéro
  // point — pas de disparition silencieuse qui laisserait croire à un oubli
  // d'affichage plutôt qu'à un choix de ne pas jouer.
  const missing: BreakdownPlayer[] = [...names.entries()]
    .filter(([userId]) => !predictedIds.has(userId))
    .map(([userId, name]) => ({
      userId,
      name,
      label: "Non parié",
      points: 0,
      level: null,
      isAuto: false,
      missing: true,
      pointAdjustment: 0,
    }));

  const players: BreakdownPlayer[] = [...scored, ...missing]
    // Le meilleur en haut : on lit le match comme un mini-classement, au net
    // une fois les pouvoirs pris en compte. Un pronostic pas encore noté
    // (`null`) reste en bas, il n'a rien rapporté.
    .sort(
      (a, b) =>
        (netPoints(b) ?? -1) - (netPoints(a) ?? -1) || a.name.localeCompare(b.name, "fr"),
    );

  const powers: BreakdownPower[] = powerUses
    .filter((u) => u.fixtureId === fixtureId)
    .map((u) => ({
      usageId: u.usageId,
      emoji: u.emoji,
      powerName: u.powerName,
      actorName: names.get(u.actorId) ?? "Joueur",
      targetName: u.targetId ? (names.get(u.targetId) ?? "Joueur") : null,
      actorDelta: u.deltaByUser.get(u.actorId) ?? 0,
      targetDelta:
        u.targetId && u.deltaByUser.has(u.targetId) ? (u.deltaByUser.get(u.targetId) ?? 0) : null,
    }))
    .sort((a, b) => a.actorName.localeCompare(b.actorName, "fr"));

  return { fixtureId, players, powers };
}

/**
 * « Sabotage · Hugo sur Pierre · Pierre -3 » — la phrase, sans la mise en forme.
 *
 * Un zéro ne s'affiche pas : le Sabotage ne rapporte rien à son auteur, et
 * l'Espion ne déplace aucun point. Écrire « +0 » laisserait croire à un gain
 * nul là où il n'y a tout simplement pas de points en jeu.
 */
export function powerSentence(power: BreakdownPower): string {
  const target = power.targetName ? ` sur ${power.targetName}` : "";
  const parts = [`${power.powerName} · ${power.actorName}${target}`];
  if (power.actorDelta !== 0) {
    parts.push(`${power.actorDelta > 0 ? "+" : ""}${power.actorDelta}`);
  }
  if (power.targetDelta !== null && power.targetDelta !== 0) {
    parts.push(`${power.targetName} ${power.targetDelta > 0 ? "+" : ""}${power.targetDelta}`);
  }
  return parts.join(" · ");
}

/**
 * Le détail de plusieurs matchs d'un coup.
 *
 * Attention : cette fonction lit les pronostics de tout le monde. Elle n'est
 * appelée que pour des matchs **terminés**, où le secret est levé depuis
 * longtemps (règle n° 3) — l'appelant filtre en amont.
 */
export async function loadFixtureBreakdowns(
  sb: SupabaseClient,
  fixtures: Array<{ id: Uuid; homeShortName: string; awayShortName: string }>,
  names: Map<string, string>,
): Promise<Map<string, FixtureBreakdown>> {
  const fixtureIds = fixtures.map((f) => f.id);
  if (fixtureIds.length === 0) return new Map();

  const [predictionsRes, bucketsRes] = await Promise.all([
    sb
      .from("predictions")
      .select(
        "id, fixture_id, user_id, outcome, margin_bucket_id, exact_home_score, exact_away_score, is_auto",
      )
      .in("fixture_id", fixtureIds),
    sb.from("margin_buckets").select("id, label"),
  ]);
  if (predictionsRes.error) throw predictionsRes.error;

  const predictionRows = (predictionsRes.data ?? []) as Array<{
    id: string;
    fixture_id: string;
    user_id: string;
    outcome: Outcome;
    margin_bucket_id: string | null;
    exact_home_score: number | null;
    exact_away_score: number | null;
    is_auto: boolean;
  }>;

  const bucketLabels = new Map<string, string>(
    ((bucketsRes.data ?? []) as Array<{ id: string; label: string }>).map((b) => [b.id, b.label]),
  );

  const scoreByPrediction = new Map<string, { points: number; level: ScoreLevel | null }>();
  if (predictionRows.length > 0) {
    const { data: scores } = await sb
      .from("prediction_scores")
      .select("prediction_id, points, breakdown")
      .in(
        "prediction_id",
        predictionRows.map((p) => p.id),
      );
    for (const s of (scores ?? []) as Array<{
      prediction_id: string;
      points: number;
      breakdown: unknown;
    }>) {
      // `prediction_scores` ne stocke pas le niveau : il se relit du détail.
      const level = levelFromBreakdown(parseBreakdown(s.breakdown));
      scoreByPrediction.set(s.prediction_id, { points: s.points, level });
    }
  }

  const predictions: RawPrediction[] = predictionRows.map((p) => {
    const score = scoreByPrediction.get(p.id);
    return {
      fixtureId: p.fixture_id,
      userId: p.user_id,
      outcome: p.outcome,
      marginBucketId: p.margin_bucket_id,
      exactHomeScore: p.exact_home_score,
      exactAwayScore: p.exact_away_score,
      isAuto: p.is_auto,
      points: score?.points ?? null,
      level: score?.level ?? null,
    };
  });

  const powerUses = await loadPowerUses(sb, new Set(fixtureIds));

  const result = new Map<string, FixtureBreakdown>();
  for (const fixture of fixtures) {
    result.set(
      fixture.id,
      buildFixtureBreakdown(
        fixture.id,
        predictions,
        powerUses,
        names,
        { home: fixture.homeShortName, away: fixture.awayShortName },
        bucketLabels,
      ),
    );
  }
  return result;
}

/**
 * Les pouvoirs posés sur ces matchs, avec ce qu'ils ont réellement déplacé.
 *
 * `power_usages` ne porte pas de colonne `fixture_id` : le match visé vit
 * dans `snapshot_before.fixtureId`, et `point_adjustments.source_id` n'a pas
 * de clé étrangère déclarée (colonne polymorphe). Les deux jointures se font
 * donc ici, à la main.
 */
export async function loadPowerUses(sb: SupabaseClient, fixtureIds: Set<string>): Promise<RawPowerUse[]> {
  const { data: usages, error } = await sb
    .from("power_usages")
    .select("id, initiator_id, target_id, state, snapshot_before, powers!inner(name, emoji)")
    .eq("state", "resolved");
  if (error) throw error;

  const uses: RawPowerUse[] = [];
  for (const row of (usages ?? []) as Array<Record<string, unknown>>) {
    const snapshot = (row.snapshot_before as Record<string, unknown>) ?? {};
    const fixtureId = snapshot.fixtureId as string | undefined;
    if (!fixtureId || !fixtureIds.has(fixtureId)) continue;
    const powers = row.powers as
      | { name: string; emoji: string }
      | { name: string; emoji: string }[]
      | null;
    const power = Array.isArray(powers) ? powers[0] : powers;
    if (!power) continue;
    uses.push({
      usageId: row.id as string,
      fixtureId,
      actorId: row.initiator_id as string,
      targetId: (row.target_id as string) ?? null,
      emoji: power.emoji,
      powerName: power.name,
      deltaByUser: new Map(),
    });
  }
  if (uses.length === 0) return [];

  const { data: adjustments } = await sb
    .from("point_adjustments")
    .select("user_id, delta, source_id")
    .in(
      "source_id",
      uses.map((u) => u.usageId),
    );

  const byUsage = new Map(uses.map((u) => [u.usageId, u]));
  for (const a of (adjustments ?? []) as Array<{
    user_id: string;
    delta: number;
    source_id: string | null;
  }>) {
    if (!a.source_id) continue;
    const use = byUsage.get(a.source_id);
    if (!use) continue;
    use.deltaByUser.set(a.user_id, (use.deltaByUser.get(a.user_id) ?? 0) + a.delta);
  }

  return uses;
}
