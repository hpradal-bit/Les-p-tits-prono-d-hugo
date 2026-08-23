import { createECDH } from "node:crypto";

/**
 * Vérifier que les deux moitiés de la paire VAPID vont ensemble.
 *
 * Les deux clés sont saisies à deux endroits différents — la publique dans
 * l'espace admin, la privée chez Vercel — et rien n'empêche d'y coller les
 * moitiés de deux générations distinctes. Le symptôme est alors un « 403 »
 * du service de push, au moment de l'envoi, sans un mot sur la cause.
 *
 * Une clé privée VAPID est un scalaire de 32 octets sur la courbe P-256 ; la
 * clé publique est le point qu'il engendre. On peut donc déduire la seconde de
 * la première et comparer, plutôt que d'attendre le refus d'Apple.
 */

/** Le point public engendré par cette clé privée, ou `null` si elle est illisible. */
export function derivePublicKey(privateKey: string): string | null {
  const raw = fromBase64Url(privateKey);
  // Un scalaire P-256 fait exactement 32 octets. Autre chose n'est pas une
  // clé privée VAPID — souvent une clé publique collée dans le mauvais champ.
  if (!raw || raw.length !== 32) return null;

  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(raw);
    return toBase64Url(ecdh.getPublicKey());
  } catch {
    // Scalaire hors de l'intervalle admis par la courbe.
    return null;
  }
}

export type PairVerdict =
  | "ok"
  | "missing"        // l'une des deux moitiés n'est pas renseignée
  | "unreadable"     // la clé privée n'est pas un scalaire P-256
  | "mismatch";      // deux moitiés valides, mais de paires différentes

/**
 * Les deux clés forment-elles une paire ?
 *
 * On compare les octets, pas les chaînes : le même point peut s'écrire avec ou
 * sans remplissage `=`, et deux écritures d'une même clé restent une paire.
 */
export function verifyPair(publicKey: string, privateKey: string): PairVerdict {
  if (!publicKey.trim() || !privateKey.trim()) return "missing";

  const derived = derivePublicKey(privateKey);
  if (!derived) return "unreadable";

  const given = fromBase64Url(publicKey);
  if (!given) return "unreadable";

  return given.equals(fromBase64Url(derived)!) ? "ok" : "mismatch";
}

/** Ce que l'écran d'administration doit lire à l'admin. */
export function describePair(verdict: PairVerdict): string {
  switch (verdict) {
    case "ok":
      return "Les deux clés forment bien une paire.";
    case "missing":
      return "Il manque une moitié de la paire.";
    case "unreadable":
      return "La clé privée n'est pas lisible : ce doit être la clé privée de la paire (43 caractères), pas la publique.";
    case "mismatch":
      return "Les deux clés ne vont pas ensemble : elles viennent de deux générations différentes. Le service de push refusera tout envoi avec un 403.";
  }
}

/**
 * Le `sub` du jeton VAPID. Apple refuse le jeton — 403 — si ce n'est pas une
 * adresse `mailto:` ou une URL `https:`.
 */
export function isValidSubject(subject: string): boolean {
  if (/^mailto:.+@.+\..+$/.test(subject)) return true;
  return /^https:\/\/.+\..+/.test(subject);
}

function fromBase64Url(value: string): Buffer | null {
  const trimmed = value.trim();
  if (!trimmed || /[^A-Za-z0-9\-_=]/.test(trimmed)) return null;
  const buffer = Buffer.from(trimmed, "base64url");
  return buffer.length > 0 ? buffer : null;
}

function toBase64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}
