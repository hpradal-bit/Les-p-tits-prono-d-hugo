/**
 * Côté navigateur : demander l'autorisation, s'abonner, se désabonner.
 * Aucune de ces opérations n'est faite au chargement — toutes partent d'un
 * geste explicite du joueur, c'est ce qu'exigent les navigateurs et c'est
 * aussi la moindre des politesses.
 */

/** La clé VAPID voyage en base64url ; l'API la veut en octets. */
function toUint8Array(base64url: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

/**
 * L'abonnement déjà posé a-t-il été créé avec la clé publique d'aujourd'hui ?
 *
 * Quand l'admin change la paire VAPID, les abonnements existants deviennent
 * définitivement inutilisables : le service de push les refuse par un 403
 * « VapidPkHashMismatch ». Rien ne le signale côté navigateur — l'interrupteur
 * reste allumé, et le joueur croit être abonné alors que plus rien n'arrive.
 * On compare les octets pour le détecter avant l'envoi.
 */
export function matchesKey(
  applied: ArrayBuffer | null | undefined,
  vapidPublicKey: string,
): boolean {
  // Un navigateur qui n'expose pas la clé de l'abonnement ne permet aucune
  // conclusion : mieux vaut garder l'abonnement que le détruire par principe.
  if (!applied) return true;

  const expected = new Uint8Array(toUint8Array(vapidPublicKey));
  const actual = new Uint8Array(applied);
  if (actual.length !== expected.length) return false;
  return actual.every((byte, i) => byte === expected[i]);
}

export type PushState =
  | "unsupported"      // le navigateur ne sait pas faire
  | "needs-install"    // iOS : il faut d'abord installer sur l'écran d'accueil
  | "denied"           // le joueur a refusé, il faut passer par les réglages système
  | "no-sw"            // le service worker ne s'active pas : rien ne peut marcher
  | "off"              // possible, pas encore activé
  | "on";              // abonné

/**
 * `navigator.serviceWorker.ready` n'échoue jamais : si aucun service worker ne
 * s'active, la promesse attend indéfiniment. L'écran restait alors sur
 * « Vérification… » sans que rien ne dise pourquoi. On borne l'attente pour
 * transformer un blocage muet en diagnostic lisible.
 */
const SW_TIMEOUT_MS = 6000;

export class PushError extends Error {}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), SW_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari iOS, qui n'implémente pas display-mode.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent);
}

export async function readState(vapidPublicKey: string): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    // Sur iPhone, le push existe — mais seulement une fois l'app installée.
    return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  }
  if (isIOS() && !isStandalone()) return "needs-install";
  if (Notification.permission === "denied") return "denied";

  const registration = await readyRegistration();
  if (!registration) return "no-sw";

  const existing = await registration.pushManager.getSubscription();
  if (!existing) return "off";

  // Un abonnement né d'une clé révolue est mort : l'annoncer « allumé » ferait
  // croire au joueur qu'il est joignable.
  return matchesKey(existing.options?.applicationServerKey, vapidPublicKey) ? "on" : "off";
}

/**
 * Chaque étape peut échouer pour une raison différente, et le joueur n'a aucun
 * moyen de la deviner. On nomme la cause plutôt que de renvoyer « ça a raté ».
 */
export async function enable(vapidPublicKey: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const registration = await readyRegistration();
  if (!registration) return "no-sw";

  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !matchesKey(subscription.options?.applicationServerKey, vapidPublicKey)) {
    // La clé du serveur a changé depuis cet abonnement. On le remplace ici
    // plutôt que d'attendre du joueur qu'il devine « coupe puis rallume ».
    await subscription.unsubscribe();
    subscription = null;
  }

  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toUint8Array(vapidPublicKey),
      });
    } catch (error) {
      // Cause la plus fréquente : la clé publique enregistrée en base ne
      // correspond pas à celle d'un abonnement déjà posé par ce navigateur.
      const detail = error instanceof Error ? error.message : String(error);
      throw new PushError(
        `Le navigateur a refusé l'abonnement (${detail}). Si la clé VAPID a changé récemment, désinstalle puis réinstalle l'app.`,
      );
    }
  }

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON(), userAgent: navigator.userAgent }),
  });
  if (!response.ok) {
    throw new PushError(
      `Le serveur a refusé l'abonnement (erreur ${response.status}). L'abonnement n'a pas été enregistré.`,
    );
  }
  return "on";
}

export async function disable(): Promise<PushState> {
  const registration = await readyRegistration();
  if (!registration) return "no-sw";

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return "off";

  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
  return "off";
}
