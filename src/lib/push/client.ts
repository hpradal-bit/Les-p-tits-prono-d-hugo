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

export type PushState =
  | "unsupported"      // le navigateur ne sait pas faire
  | "needs-install"    // iOS : il faut d'abord installer sur l'écran d'accueil
  | "denied"           // le joueur a refusé, il faut passer par les réglages système
  | "off"              // possible, pas encore activé
  | "on";              // abonné

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

export async function readState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    // Sur iPhone, le push existe — mais seulement une fois l'app installée.
    return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  }
  if (isIOS() && !isStandalone()) return "needs-install";
  if (Notification.permission === "denied") return "denied";

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  return existing ? "on" : "off";
}

export async function enable(vapidPublicKey: string): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toUint8Array(vapidPublicKey),
    }));

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON(), userAgent: navigator.userAgent }),
  });
  if (!response.ok) throw new Error("Le serveur a refusé l'abonnement.");
  return "on";
}

export async function disable(): Promise<PushState> {
  const registration = await navigator.serviceWorker.ready;
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
