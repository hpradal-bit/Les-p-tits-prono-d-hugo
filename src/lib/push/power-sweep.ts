/**
 * Balayage périodique : envoie, une fois que c'est sûr, la notification
 * poussée à la cible d'un pouvoir déclaré contre elle.
 *
 * `declarePower` (`src/lib/powers/actions.ts`) insère la ligne
 * `power_usages` à la déclaration, mais n'envoie plus rien à cet instant :
 * avant le coup d'envoi — pire, avant que la journée entière ait verrouillé
 * — la cible notifiée aurait pu riposter avant que l'auteur n'ait lui-même
 * couru le moindre risque (rapport de l'hôte, cf. migration 0067). Ce
 * balayage, appelé par `/api/push/dispatch` au même rythme que les rappels de
 * verrouillage (cron Cloudflare toutes les 2 minutes, `worker/wrangler.toml`),
 * rattrape l'envoi :
 *
 *   - jamais avant que TOUS les matchs de la journée (`round_id`) aient
 *     verrouillé (`round-lock.ts`, pas seulement le match visé) ;
 *   - jamais pour l'Espion (`spy`) : secret permanent, personne ne doit
 *     jamais savoir qu'il a été observé.
 *
 * Idempotent et rejouable sans effet de bord : chaque ligne est RÉCLAMÉE par
 * un `UPDATE ... WHERE target_notified_at IS NULL` avant l'envoi — si deux
 * balayages se chevauchent, un seul gagne la course pour une ligne donnée, et
 * `enqueue()` (dedupe_key unique, cf. `notify.ts`) ferme la deuxième porte au
 * cas où l'envoi lui-même serait rejoué.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueue } from "./notify.ts";
import { buildPowerDeclaredNotification } from "./powers.ts";
// Chemins relatifs, pas l'alias `@/...` : ce fichier doit rester exécutable
// par `node --test` seul (sans résolution de bundler), comme ses voisins.
import { isPowerPublic } from "../powers/visibility.ts";
import { loadRoundRevealTimes } from "../powers/round-lock.ts";

/** Jamais notifié pour ce pouvoir — secret permanent (cf. en-tête du fichier). */
const NEVER_NOTIFY_CODES = new Set(["spy"]);

interface CandidateRow {
  id: string;
  initiator_id: string;
  target_id: string;
  round_id: string;
  powers: PowerInfo | PowerInfo[] | null;
}

interface PowerInfo {
  code: string;
  emoji: string;
  name: string;
  config: Record<string, unknown> | null;
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export async function sweepPowerDeclaredNotifications(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin
    .from("power_usages")
    .select("id, initiator_id, target_id, round_id, powers!inner(code, emoji, name, config)")
    .in("state", ["declared", "accepted"])
    .not("target_id", "is", null)
    .is("target_notified_at", null);
  if (error) throw error;

  const rows = (data ?? []) as unknown as CandidateRow[];
  // Jamais pour l'Espion : filtré avant même de regarder le verrouillage —
  // un Espion dont la journée est verrouillée ne devient pas notifiable pour
  // autant.
  const eligible = rows.filter((r) => {
    const power = one(r.powers);
    return power !== null && !NEVER_NOTIFY_CODES.has(power.code);
  });
  if (eligible.length === 0) return 0;

  const roundIds = [...new Set(eligible.map((r) => r.round_id))];
  const revealTimes = await loadRoundRevealTimes(admin, roundIds);
  const now = new Date();

  let sent = 0;
  for (const row of eligible) {
    const revealAt = revealTimes.get(row.round_id) ?? null;
    if (!isPowerPublic(revealAt, now)) continue;

    const power = one(row.powers);
    if (!power) continue;

    // Réclame la ligne avant d'envoyer quoi que ce soit : si un autre
    // balayage l'a déjà prise entre notre lecture et cet UPDATE, `claimed`
    // revient vide et on passe à la ligne suivante sans jamais doubler
    // l'envoi.
    const { data: claimed, error: claimError } = await admin
      .from("power_usages")
      .update({ target_notified_at: now.toISOString() })
      .eq("id", row.id)
      .is("target_notified_at", null)
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) continue;

    const { data: initiatorProfile } = await admin
      .from("profiles")
      .select("display_name, first_name")
      .eq("id", row.initiator_id)
      .maybeSingle();
    const initiatorName =
      initiatorProfile?.display_name || initiatorProfile?.first_name || "Quelqu'un";

    const rawEffect = power.config?.effect;
    const effect = typeof rawEffect === "string" && rawEffect.length > 0 ? rawEffect : null;

    const outcome = await enqueue(
      admin,
      buildPowerDeclaredNotification(row.target_id, {
        usageId: row.id,
        powerEmoji: power.emoji,
        powerName: power.name,
        powerEffect: effect,
        initiatorName,
      }),
    );
    if (outcome === "queued") sent += 1;
  }

  return sent;
}
