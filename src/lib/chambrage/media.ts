/**
 * Contraintes du bucket `chambrage-media` (migration 0052), reprises ici pour
 * que le serveur les vérifie avant même d'essayer l'envoi — l'appel à
 * Storage échouerait de toute façon, mais avec un message générique.
 */
export const CHAMBRAGE_MEDIA_BUCKET = "chambrage-media";
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
