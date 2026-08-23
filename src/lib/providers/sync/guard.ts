/**
 * Protection des routes de synchronisation.
 *
 * Ces routes écrivent des scores : personne d'autre que le planificateur (le
 * Worker Cloudflare) ou l'admin ne doit pouvoir les déclencher. Le secret
 * partagé `SYNC_SECRET` vit côté serveur uniquement — jamais dans une variable
 * `NEXT_PUBLIC_*`.
 */

import { z } from "zod";

export type GuardFailure = { ok: false; status: 401 | 500; message: string };
export type GuardSuccess = { ok: true };

/** Comparaison à durée constante : pas d'indice par le temps de réponse. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Le secret est accepté dans `x-sync-secret` ou en `Authorization: Bearer`.
 * Rien d'autre : ni paramètre d'URL (qui finirait dans les journaux), ni cookie.
 */
export function checkSyncSecret(request: Request): GuardSuccess | GuardFailure {
  const expected = process.env.SYNC_SECRET;
  if (!expected || expected.length < 16) {
    return {
      ok: false,
      status: 500,
      message: "SYNC_SECRET absente ou trop courte côté serveur.",
    };
  }

  const header = request.headers.get("x-sync-secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = header ?? bearer ?? "";

  if (!provided || !safeEqual(provided, expected)) {
    return { ok: false, status: 401, message: "Secret de synchronisation invalide." };
  }
  return { ok: true };
}

// --- Validation des entrées (règle n°7 : Zod côté serveur, toujours) ---------

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date attendue au format AAAA-MM-JJ")
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), "date inexistante");

export const calendarRequestSchema = z
  .object({
    seasonId: z.uuid().optional(),
    from: dateKey.optional(),
    to: dateKey.optional(),
    dryRun: z.boolean().optional(),
  })
  .refine((v) => (v.from === undefined) === (v.to === undefined), {
    message: "`from` et `to` vont par paire",
  })
  .refine((v) => v.from === undefined || v.to === undefined || v.from <= v.to, {
    message: "`from` doit précéder `to`",
  });

export const liveRequestSchema = z.object({
  seasonId: z.uuid().optional(),
  date: dateKey.optional(),
  force: z.boolean().optional(),
});

export const standingsRequestSchema = z.object({
  seasonId: z.uuid().optional(),
});

/** Lit le corps JSON (vide accepté) et le valide. */
export async function readBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  let raw: unknown = {};
  const text = await request.text();
  if (text.trim() !== "") {
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, message: "Corps de requête illisible : JSON attendu." };
    }
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "corps"} : ${i.message}`)
      .join(" · ");
    return { ok: false, message: `Requête invalide — ${detail}` };
  }
  return { ok: true, value: parsed.data };
}
