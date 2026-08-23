import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Envoi Web Push, en VAPID — sans service tiers, donc sans coût ni compte
 * supplémentaire. Le protocole est standard : le navigateur du joueur a donné
 * une adresse d'abonnement, on y dépose un message chiffré.
 */

/**
 * La dernière clé publique passée à web-push. On mémorise la valeur, pas un
 * simple booléen : l'admin peut changer la clé en base, et une instance encore
 * chaude doit repartir sur la nouvelle plutôt que sur celle du premier envoi.
 */
let configuredWith: string | null = null;

/**
 * Renvoie false si les clés VAPID ne sont pas renseignées : on n'échoue pas,
 * on s'abstient.
 *
 * La clé **publique** vit en base (`app_settings`), pas dans une variable
 * `NEXT_PUBLIC_*` : compilée dans le build, elle obligeait à vider le cache de
 * Vercel à chaque changement. La clé **privée** reste une variable serveur —
 * elle ne doit jamais partir vers un navigateur (règle n° 4, même esprit).
 */
export async function configure(admin: SupabaseClient): Promise<boolean> {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!privateKey) return false;

  const publicKey = await loadPublicKey(admin);
  if (!publicKey) return false;

  if (configuredWith === publicKey) return true;

  const subject = process.env.VAPID_SUBJECT ?? "mailto:contact@example.com";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configuredWith = publicKey;
  return true;
}

/** La clé publique telle que l'espace admin l'a enregistrée. */
export async function loadPublicKey(admin: SupabaseClient): Promise<string> {
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "push_notifications.vapid_public_key")
    .maybeSingle();
  return typeof data?.value === "string" ? data.value.trim() : "";
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
  /**
   * Ce que le service de push a répondu quand il a refusé. Sans ça, un test
   * qui échoue ne dit rien de plus que « ça n'a pas marché ».
   */
  errors: string[];
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
  const result: DeliveryResult = { sent: 0, revoked: 0, failed: 0, errors: [] };
  if (!(await configure(admin))) return result;

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
        result.errors.push(`abonnement expiré (${status})`);
      } else {
        // Échec passager : on garde l'abonnement et on compte le raté.
        const { data: current } = await admin
          .from("push_subscriptions").select("failure_count").eq("id", sub.id).maybeSingle();
        await admin
          .from("push_subscriptions")
          .update({ failure_count: (current?.failure_count ?? 0) + 1, last_error: message })
          .eq("id", sub.id);
        result.failed += 1;
        result.errors.push(status ? `${status} — ${message}` : message);
      }
    }
  }

  return result;
}
