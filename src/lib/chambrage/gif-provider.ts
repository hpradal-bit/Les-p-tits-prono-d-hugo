/**
 * Recherche de GIF animés, comme sur WhatsApp — via GIPHY, gratuit.
 *
 * Un GIF envoyé n'est jamais re-téléversé dans notre Storage : on garde
 * l'URL du CDN GIPHY telle quelle (`messages.media_url`, message_type
 * `image` — un GIF n'est jamais qu'une image qui bouge, pas un type à
 * part). Ça évite de payer la bande passante et le stockage d'un
 * fournisseur qui les sert déjà très bien.
 *
 * Remplace Tenor (Google), dont l'API a fermé aux nouvelles inscriptions le
 * 14 janvier 2026 et s'est arrêtée définitivement le 30 juin 2026.
 *
 * Sans clé `GIPHY_API_KEY`, la recherche échoue proprement (résultat vide,
 * jamais une page qui casse) — c'est à l'administrateur de configurer la
 * variable, gratuite (clé « beta », 100 requêtes/heure) sur
 * https://developers.giphy.com
 */

const GIPHY_API_BASE = "https://api.giphy.com/v1/gifs/search";

export interface GifResult {
  id: string;
  /** Petit format, pour la grille de résultats. */
  previewUrl: string;
  /** Format complet, celui qui part réellement dans le message. */
  url: string;
  /** Titre fourni par GIPHY, jamais vide grâce au repli. */
  description: string;
}

export class GifProviderError extends Error {}

/** Seuls les domaines GIPHY connus peuvent finir dans un message — jamais une URL arbitraire. */
export function isGiphyMediaUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    return protocol === "https:" && /(^|\.)giphy\.com$/.test(hostname);
  } catch {
    return false;
  }
}

export async function searchGifs(query: string, limit = 24): Promise<GifResult[]> {
  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    throw new GifProviderError("Recherche de GIF indisponible : GIPHY_API_KEY absente (à configurer par l'admin).");
  }
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const url = new URL(GIPHY_API_BASE);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", String(Math.min(Math.max(1, limit), 50)));
  url.searchParams.set("rating", "pg-13");
  url.searchParams.set("lang", "fr");

  const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) {
    throw new GifProviderError(`GIPHY a répondu ${response.status}.`);
  }

  const payload = (await response.json()) as {
    data?: Array<{
      id: string;
      title?: string;
      images?: {
        fixed_width?: { url: string };
        fixed_width_small?: { url: string };
        // Plafonné à 2 Mo par GIPHY — évite le poids d'un « original » brut
        // dans la conversation, tout en restant net.
        downsized?: { url: string };
        original?: { url: string };
      };
    }>;
  };

  return (payload.data ?? [])
    .map((r) => {
      const full = r.images?.downsized?.url ?? r.images?.original?.url;
      const preview = r.images?.fixed_width_small?.url ?? r.images?.fixed_width?.url ?? full;
      if (!full || !preview || !isGiphyMediaUrl(full) || !isGiphyMediaUrl(preview)) return null;
      return {
        id: r.id,
        url: full,
        previewUrl: preview,
        description: r.title?.trim() || "GIF",
      };
    })
    .filter((r): r is GifResult => r !== null);
}
