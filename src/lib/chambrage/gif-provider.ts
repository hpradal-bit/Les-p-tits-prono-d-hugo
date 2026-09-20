/**
 * Recherche de GIF animés, comme sur WhatsApp — via Tenor (Google), gratuit.
 *
 * Un GIF envoyé n'est jamais re-téléversé dans notre Storage : on garde
 * l'URL du CDN Tenor telle quelle (`messages.media_url`, message_type
 * `image` — un GIF n'est jamais qu'une image qui bouge, pas un type à
 * part). Ça évite de payer la bande passante et le stockage d'un
 * fournisseur qui les sert déjà très bien.
 *
 * Sans clé `TENOR_API_KEY`, la recherche échoue proprement (résultat vide,
 * jamais une page qui casse) — c'est à l'administrateur de configurer la
 * variable, gratuite chez Google : https://developers.google.com/tenor/guides/quickstart
 */

const TENOR_API_BASE = "https://tenor.googleapis.com/v2/search";
/** Identifie l'appli auprès de Tenor, sans lien avec le compte d'un joueur. */
const CLIENT_KEY = "les_ptits_pronos_dhugo";

export interface GifResult {
  id: string;
  /** Petit format, pour la grille de résultats. */
  previewUrl: string;
  /** Format complet, celui qui part réellement dans le message. */
  url: string;
  /** Texte alternatif fourni par Tenor, jamais vide grâce au repli. */
  description: string;
}

export class GifProviderError extends Error {}

/** Seuls les domaines Tenor connus peuvent finir dans un message — jamais une URL arbitraire. */
export function isTenorMediaUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    return protocol === "https:" && /(^|\.)tenor\.com$/.test(hostname);
  } catch {
    return false;
  }
}

export async function searchGifs(query: string, limit = 24): Promise<GifResult[]> {
  const apiKey = process.env.TENOR_API_KEY;
  if (!apiKey) {
    throw new GifProviderError("Recherche de GIF indisponible : TENOR_API_KEY absente (à configurer par l'admin).");
  }
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const url = new URL(TENOR_API_BASE);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("client_key", CLIENT_KEY);
  url.searchParams.set("limit", String(Math.min(Math.max(1, limit), 50)));
  url.searchParams.set("media_filter", "tinygif,gif");
  url.searchParams.set("contentfilter", "medium");
  url.searchParams.set("locale", "fr_FR");

  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) {
    throw new GifProviderError(`Tenor a répondu ${response.status}.`);
  }

  const payload = (await response.json()) as {
    results?: Array<{
      id: string;
      content_description?: string;
      media_formats?: {
        gif?: { url: string };
        tinygif?: { url: string };
      };
    }>;
  };

  return (payload.results ?? [])
    .map((r) => {
      const full = r.media_formats?.gif?.url;
      const preview = r.media_formats?.tinygif?.url ?? full;
      if (!full || !preview || !isTenorMediaUrl(full) || !isTenorMediaUrl(preview)) return null;
      return {
        id: r.id,
        url: full,
        previewUrl: preview,
        description: r.content_description?.trim() || "GIF",
      };
    })
    .filter((r): r is GifResult => r !== null);
}
