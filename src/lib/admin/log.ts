import type { SupabaseClient } from "@supabase/supabase-js";
import type { Uuid } from "@/lib/types";
import type { AdminActionCode, AdminEntity } from "./types";

/**
 * Le journal d'administration.
 *
 * Règle 6 du projet : **toute** action d'administration écrit ici, avec une
 * raison. Ce n'est pas de la traçabilité pour la forme — c'est ce qui règle le
 * problème « l'administrateur est aussi un joueur » (docs/00-AUDIT.md, point
 * 18). Le journal est lisible par tout le groupe et la base refuse qu'on le
 * réécrive (déclencheurs de la migration 0014).
 *
 * Aucune action de l'espace admin n'écrit dans `admin_actions` autrement que
 * par cette fonction : c'est le seul endroit qui sait à quoi ressemble une
 * ligne de journal correcte.
 */

export interface AdminLogEntry {
  adminId: Uuid;
  action: AdminActionCode;
  entityType: AdminEntity;
  entityId?: Uuid | null;
  /** État avant l'action. `null` pour une création. */
  before?: unknown;
  /** État après l'action. `null` pour une suppression. */
  after?: unknown;
  /** Obligatoire, et non vide : c'est la moitié de l'intérêt du journal. */
  reason: string;
  /**
   * Contexte de l'événement publié dans `events`. Le fil social, les badges et
   * les notifications lisent ce flux, ils ne rejouent pas la logique admin.
   */
  event?: {
    seasonId?: Uuid | null;
    roundId?: Uuid | null;
    fixtureId?: Uuid | null;
    targetId?: Uuid | null;
    /** Complément de charge utile ; le code et la raison y sont déjà. */
    payload?: Record<string, unknown>;
  };
}

/** La raison minimale acceptée. Alignée sur la contrainte SQL de 0014. */
export const MIN_REASON_LENGTH = 3;

export class MissingReasonError extends Error {
  constructor() {
    super("Une raison est obligatoire pour toute action d'administration.");
    this.name = "MissingReasonError";
  }
}

/**
 * Nettoie une raison saisie à l'écran. Lève si elle est vide : mieux vaut
 * refuser l'action que d'écrire une ligne de journal inexploitable.
 */
export function normalizeReason(raw: unknown): string {
  const reason = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (reason.length < MIN_REASON_LENGTH) throw new MissingReasonError();
  return reason.slice(0, 500);
}

/** `undefined` n'existe pas en JSON : on le rend explicitement nul. */
function toJson(value: unknown): unknown {
  return value === undefined ? null : value;
}

/**
 * Écrit une ligne de journal, puis l'événement correspondant.
 *
 * Renvoie l'identifiant de la ligne écrite. Le client doit être celui de
 * service : `admin_actions` n'a aucune politique d'écriture, même pour l'admin.
 */
export async function logAdminAction(
  admin: SupabaseClient,
  entry: AdminLogEntry,
): Promise<Uuid> {
  const reason = normalizeReason(entry.reason);

  const { data, error } = await admin
    .from("admin_actions")
    .insert({
      admin_id: entry.adminId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      before: toJson(entry.before),
      after: toJson(entry.after),
      reason,
    })
    .select("id")
    .single();

  if (error) throw error;

  // Règle 8 : le flux d'événements est la source unique du fil social.
  // Un échec ici ne doit pas annuler l'action, déjà appliquée et journalisée.
  const ev = entry.event;
  try {
    await admin.from("events").insert({
      kind: "admin_action",
      season_id: ev?.seasonId ?? null,
      round_id: ev?.roundId ?? null,
      fixture_id: ev?.fixtureId ?? null,
      actor_id: entry.adminId,
      target_id: ev?.targetId ?? null,
      payload: {
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId ?? null,
        reason,
        ...(ev?.payload ?? {}),
      },
    });
  } catch {
    // Journal écrit, événement perdu : l'action reste tracée là où ça compte.
  }

  return data.id as Uuid;
}
