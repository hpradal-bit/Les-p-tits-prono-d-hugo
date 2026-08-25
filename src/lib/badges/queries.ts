/**
 * Lecture des badges. Serveur uniquement.
 *
 * Le moteur ne touche jamais la base : ce fichier est le seul pont entre les
 * deux, et il ne fait que traduire des lignes en objets.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { earnedKey } from "./engine.ts";
import type { BadgeDefinition, BadgeRule } from "./types.ts";
import type { Uuid } from "../types.ts";

interface RawBadgeRow {
  id: string;
  code: string;
  name: string;
  emoji: string;
  description: string | null;
  rule: unknown;
  is_active: boolean;
}

function toBadge(row: RawBadgeRow): BadgeDefinition {
  const rule = (row.rule ?? {}) as BadgeRule;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    emoji: row.emoji,
    description: row.description,
    rule: typeof rule === "object" && rule !== null ? rule : { type: "" },
    isActive: row.is_active,
  };
}

/** Les badges actifs, dans l'ordre de création : l'ordre de la base fait foi. */
export async function loadActiveBadges(sb: SupabaseClient): Promise<BadgeDefinition[]> {
  const { data, error } = await sb
    .from("badges")
    .select("id, code, name, emoji, description, rule, is_active")
    .eq("is_active", true)
    .order("created_at");
  if (error) throw error;
  return ((data ?? []) as RawBadgeRow[]).map(toBadge);
}

/** Les clés `userId:badgeId` déjà décernées sur la saison. */
export async function loadEarnedKeys(
  sb: SupabaseClient,
  seasonId: Uuid,
): Promise<Set<string>> {
  const { data, error } = await sb
    .from("user_badges")
    .select("user_id, badge_id")
    .eq("season_id", seasonId);
  if (error) throw error;

  return new Set(
    ((data ?? []) as Array<{ user_id: string; badge_id: string }>).map((r) =>
      earnedKey(r.user_id, r.badge_id),
    ),
  );
}

export interface EarnedBadge {
  badgeId: Uuid;
  code: string;
  name: string;
  emoji: string;
  description: string | null;
  context: Record<string, unknown>;
  earnedAt: string;
}

/** Les badges de chaque joueur sur la saison, du plus récent au plus ancien. */
export async function loadPlayerBadges(
  sb: SupabaseClient,
  seasonId: Uuid,
): Promise<Map<Uuid, EarnedBadge[]>> {
  const { data, error } = await sb
    .from("user_badges")
    .select("user_id, badge_id, context, earned_at, badges!inner(code, name, emoji, description)")
    .eq("season_id", seasonId)
    .order("earned_at", { ascending: false });
  if (error) throw error;

  const out = new Map<Uuid, EarnedBadge[]>();
  for (const row of (data ?? []) as unknown as Array<{
    user_id: string;
    badge_id: string;
    context: Record<string, unknown> | null;
    earned_at: string;
    badges: { code: string; name: string; emoji: string; description: string | null } | null;
  }>) {
    const badge = Array.isArray(row.badges) ? row.badges[0] : row.badges;
    if (!badge) continue;
    const list = out.get(row.user_id) ?? [];
    list.push({
      badgeId: row.badge_id,
      code: badge.code,
      name: badge.name,
      emoji: badge.emoji,
      description: badge.description,
      context: row.context ?? {},
      earnedAt: row.earned_at,
    });
    out.set(row.user_id, list);
  }
  return out;
}
