/**
 * Chantier A — avatars : la partie pure.
 *
 * Trois formes d'avatar, telles que définies par `profiles.avatar_kind` :
 *   · `emoji` → `avatar_value` contient l'emoji lui-même ;
 *   · `club`  → `avatar_value` contient le code du club (`ST`, `UBB`…) ;
 *   · `photo` → `avatar_value` contient l'URL publique du fichier téléversé.
 *
 * Ce fichier n'importe rien : ni base, ni réseau, ni React. C'est ce qui permet
 * de le tester au lancement de `npm test` — et c'est là que vit le garde-fou du
 * téléversement. La lecture des réglages, elle, est dans `avatar-policy.ts`.
 */

export const AVATAR_BUCKET = "avatars";

/** Valeurs de repli, utilisées uniquement si la base est injoignable. */
export const FALLBACK_MAX_BYTES = 2 * 1024 * 1024;
export const FALLBACK_ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export const FALLBACK_EMOJIS = ["🏉", "🥇", "🔥", "🐐", "😎", "🤡"] as const;
export const FALLBACK_DEFAULT_EMOJI = "🏉";

export interface AvatarPolicy {
  maxBytes: number;
  allowedMime: string[];
  emojis: string[];
  defaultKind: "emoji" | "photo" | "club";
  defaultValue: string;
}

export interface ClubAvatar {
  code: string;
  name: string;
  logoUrl: string;
}

/* --------------------------------------------------------------------------
   Reniflage du contenu réel — sécurité
   -------------------------------------------------------------------------- */

/**
 * Le type MIME annoncé par le navigateur est déclaratif : il se falsifie en
 * trois clics. On lit donc les premiers octets du fichier.
 *
 * Fonction pure, testée dans `avatars.test.ts`.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  const at = (i: number) => bytes[i];
  const ascii = (start: number, text: string) =>
    text.split("").every((c, i) => bytes[start + i] === c.charCodeAt(0));

  // PNG : 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    at(0) === 0x89 &&
    ascii(1, "PNG") &&
    at(4) === 0x0d &&
    at(5) === 0x0a &&
    at(6) === 0x1a &&
    at(7) === 0x0a
  ) {
    return "image/png";
  }

  // JPEG : FF D8 FF
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) {
    return "image/jpeg";
  }

  // WebP : "RIFF" .... "WEBP"
  if (bytes.length >= 12 && ascii(0, "RIFF") && ascii(8, "WEBP")) {
    return "image/webp";
  }

  return null;
}

/** Extension de fichier imposée par le serveur, jamais reprise du nom d'origine. */
export function extensionFor(mime: string): string | null {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

/**
 * Chemin d'un objet du bucket à partir de son URL publique.
 * Sert à effacer l'ancienne photo quand le joueur en téléverse une nouvelle :
 * sans cela, le stockage gratuit se remplit de fichiers orphelins.
 *
 * Renvoie `null` si l'URL ne désigne pas un objet de notre bucket.
 * Fonction pure, testée dans `avatars.test.ts`.
 */
export function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;

  const path = url.slice(at + marker.length).split("?")[0];
  if (!path || path.includes("..")) return null;
  return decodeURIComponent(path);
}

/* --------------------------------------------------------------------------
   Rendu
   -------------------------------------------------------------------------- */

export type ResolvedAvatar =
  | { type: "emoji"; emoji: string }
  | { type: "image"; src: string; alt: string };

/**
 * Traduit le couple (`avatar_kind`, `avatar_value`) en quelque chose
 * d'affichable. Repli sur un emoji si la valeur ne correspond plus à rien
 * (club retiré de la base, fichier effacé…).
 */
export function resolveAvatar(
  kind: string,
  value: string,
  clubs: readonly ClubAvatar[] = [],
  fallbackEmoji: string = FALLBACK_DEFAULT_EMOJI,
): ResolvedAvatar {
  if (kind === "photo" && value) return { type: "image", src: value, alt: "Photo de profil" };

  if (kind === "club") {
    const club = clubs.find((c) => c.code === value);
    if (club) return { type: "image", src: club.logoUrl, alt: club.name };
    return { type: "emoji", emoji: fallbackEmoji };
  }

  return { type: "emoji", emoji: value || fallbackEmoji };
}
