/**
 * Contraintes du bucket `chambrage-media` (migration 0052), reprises ici pour
 * que le serveur les vérifie avant même d'essayer l'envoi — l'appel à
 * Storage échouerait de toute façon, mais avec un message générique.
 */
export const CHAMBRAGE_MEDIA_BUCKET = "chambrage-media";
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

/** Un vocal dure rarement plus de deux minutes ; large marge à 6 Mo. */
export const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 180;
export const ALLOWED_AUDIO_MIME = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/aac",
] as const;

/**
 * Identifie le vrai format d'un fichier audio à ses octets magiques — jamais
 * au type déclaré par le navigateur, qui n'est qu'une déclaration. Même
 * précaution que `sniffImageType` (`src/lib/auth/avatars.ts`) pour les photos.
 */
export function sniffAudioType(bytes: Uint8Array): string | null {
  const at = (i: number) => bytes[i];
  const ascii = (start: number, text: string) =>
    text.split("").every((c, i) => bytes[start + i] === c.charCodeAt(0));

  // WebM (Matroska) : en-tête EBML 1A 45 DF A3 — ce que produit MediaRecorder
  // sur Chrome/Firefox.
  if (bytes.length >= 4 && at(0) === 0x1a && at(1) === 0x45 && at(2) === 0xdf && at(3) === 0xa3) {
    return "audio/webm";
  }

  // Ogg : "OggS"
  if (bytes.length >= 4 && ascii(0, "OggS")) {
    return "audio/ogg";
  }

  // MP4/M4A : taille sur 4 octets puis "ftyp" — ce que produit MediaRecorder
  // sur Safari/iOS.
  if (bytes.length >= 8 && ascii(4, "ftyp")) {
    return "audio/mp4";
  }

  // MP3 : balise ID3, ou synchronisation de trame FF Ex/Fx sans ID3.
  if (bytes.length >= 3 && ascii(0, "ID3")) {
    return "audio/mpeg";
  }
  if (bytes.length >= 2 && at(0) === 0xff && (at(1) & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }

  return null;
}

export function audioExtensionFor(mime: string): string | null {
  switch (mime) {
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/mp4":
      return "m4a";
    case "audio/mpeg":
      return "mp3";
    case "audio/aac":
      return "aac";
    default:
      return null;
  }
}
