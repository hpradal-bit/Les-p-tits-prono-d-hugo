import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Envoi Web Push, en VAPID — sans service tiers, donc sans coût ni compte
 * supplémentaire. Le protocole est standard : le navigateur du joueur a donné
 * une adresse d'abonnement, on y dépose un message chiffré.
 */

let configured = false;

/** Renvoie false si les clés VAPID ne sont pas renseignées : on n'échoue pas, on s'abstient. */
export function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:contact@example.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  kind?: string;
  tag?: string;
}

export interface DeliveryResult {
  sent: number;
  revoked: number;
  failed: number;
}

/**
 * Dépose un message sur tous les abonnements vivants d'un joueur.
 *
 * Un abonnement que le service de push refuse définitivement (404 ou 410) est
 * révoqué plutôt que réessayé indéfiniment : le navigateur a été désinstallé,
 * ou le joueur a retiré l'autorisation.
 */
export async function sendToUser(
  admin: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<DeliveryResult> {
  const result: DeliveryResult = { sent: 0, revoked: 0, failed: 0 };
  if (!configure()) return result;

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, keys")
    .eq("user_id", userId)
    .is("revoked_at", null);

  for (const sub of subs ?? []) {
    const keys = sub.keys as { p256dh?: string; auth?: string } | null;
    if (!keys?.p256dh || !keys?.auth) continue;

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint as string, keys: { p256dh: keys.p256dh, auth: keys.auth } },
        JSON.stringify(payload),
      );
      result.sent += 1;
      await admin
        .from("push_subscriptions")
        .update({ last_used_at: new Date().toISOString(), failure_count: 0, last_error: null })
        .eq("id", sub.id);
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      const message = error instanceof Error ? error.message : String(error);

      if (status === 404 || status === 410) {
        await admin
          .from("push_subscriptions")
          .update({ revoked_at: new Date().toISOString(), last_error: message })
          .eq("id", sub.id);
        result.revoked += 1;
      } else {
        // Échec passager : on garde l'abonnement et on compte le raté.
        const { data: current } = await admin
          .from("push_subscriptions").select("failure_count").eq("id", sub.id).maybeSingle();
        await admin
          .from("push_subscriptions")
          .update({ failure_count: (current?.failure_count ?? 0) + 1, last_error: message })
          .eq("id", sub.id);
        result.failed += 1;
      }
    }
  }

  return result;
}
