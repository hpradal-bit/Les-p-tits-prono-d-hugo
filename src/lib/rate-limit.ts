/**
 * Limite de fréquence applicative, par utilisateur, en mémoire.
 *
 * Audit technique, point 10 (P3). Les routes API publiques appelées par le
 * client (`/api/push/subscribe`, `/api/push/unsubscribe`,
 * `/api/chambrage/unread`, `/api/feed/unread`) sont protégées par
 * l'authentification Supabase, mais rien ne borne la fréquence des appels
 * d'un même compte : un bug de polling mal débranché côté client, ou un
 * client modifié, peut générer une charge non bornée vers Supabase.
 *
 * Budget 0 €/mois (AGENTS.md) : pas d'Upstash Ratelimit ni de Vercel Edge
 * Config, un compteur glissant en mémoire de processus — jamais parfait sur
 * plusieurs instances serverless froides/chaudes en parallèle (chaque
 * instance a son propre compteur), mais suffisant pour couper une boucle
 * pathologique bien avant qu'elle ne devienne un incident, à ce stade du
 * projet. `sync_locks` (migration 0063) suit le même principe de proportion
 * : une protection best-effort plutôt qu'une dépendance payante.
 */

interface Bucket {
  count: number;
  windowStartedAt: number;
}

const buckets = new Map<string, Bucket>();

// Une entrée par (route, identité) ; nettoyée paresseusement pour ne jamais
// grossir sans borne sur un process qui vit des heures (cf. Worker/Vercel).
const MAX_TRACKED_KEYS = 5_000;

export interface RateLimitResult {
  ok: boolean;
  /** Secondes à attendre avant de réessayer, si `ok` est faux. */
  retryAfterSeconds: number;
}

/**
 * Autorise ou refuse un appel, sous une fenêtre glissante simplifiée
 * (fenêtre fixe qui se réinitialise après `windowMs`— suffisant pour cet
 * usage, pas un algorithme de rationnement de précision).
 */
export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();

  if (buckets.size > MAX_TRACKED_KEYS) {
    // Filet de sécurité mémoire : purge les fenêtres expirées avant de
    // continuer à grossir. Coût O(n), rare (uniquement au-delà du seuil).
    for (const [k, b] of buckets) {
      if (now - b.windowStartedAt > windowMs) buckets.delete(k);
    }
  }

  const existing = buckets.get(key);
  if (!existing || now - existing.windowStartedAt > windowMs) {
    buckets.set(key, { count: 1, windowStartedAt: now });
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    const retryAfterSeconds = Math.ceil((existing.windowStartedAt + windowMs - now) / 1000);
    return { ok: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  }

  existing.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}

/** Une réponse 429 prête à renvoyer, avec l'en-tête Retry-After standard. */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(JSON.stringify({ error: "Trop de requêtes. Réessaie dans un instant." }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(result.retryAfterSeconds),
    },
  });
}
