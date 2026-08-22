import { z } from "zod";

/**
 * Chantier A — schémas de validation des comptes et des profils.
 *
 * Règle non négociable n° 7 : toute entrée est validée ici, côté serveur, même
 * lorsque l'écran l'a déjà vérifiée. Les messages sont en français : ils sont
 * affichés tels quels sous les champs.
 */

/* --------------------------------------------------------------------------
   Briques réutilisables
   -------------------------------------------------------------------------- */

const email = z
  .string({ error: "Adresse e-mail requise." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Cette adresse e-mail n'est pas valide." }));

/** 72 octets : limite de bcrypt, appliquée par Supabase Auth. */
const password = z
  .string({ error: "Mot de passe requis." })
  .min(8, { error: "Le mot de passe doit faire au moins 8 caractères." })
  .max(72, { error: "Le mot de passe ne peut pas dépasser 72 caractères." });

const firstName = z
  .string({ error: "Prénom requis." })
  .trim()
  .min(1, { error: "Le prénom ne peut pas être vide." })
  .max(40, { error: "40 caractères maximum." });

const displayName = z
  .string({ error: "Pseudo requis." })
  .trim()
  .min(2, { error: "Le pseudo doit faire au moins 2 caractères." })
  .max(24, { error: "24 caractères maximum." });

const inviteCode = z
  .string({ error: "Code d'invitation requis." })
  .trim()
  .min(1, { error: "Le code d'invitation ne peut pas être vide." })
  .max(64, { error: "Ce code est trop long." });

/* --------------------------------------------------------------------------
   Comptes
   -------------------------------------------------------------------------- */

export const signUpSchema = z.object({
  inviteCode,
  firstName,
  displayName,
  email,
  password,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email,
  // Volontairement permissif : on n'impose pas la politique du jour aux comptes
  // créés hier. C'est Supabase qui tranche.
  password: z
    .string({ error: "Mot de passe requis." })
    .min(1, { error: "Mot de passe requis." }),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const newPasswordSchema = z
  .object({ password, confirmation: z.string() })
  .refine((v) => v.password === v.confirmation, {
    error: "Les deux mots de passe ne correspondent pas.",
    path: ["confirmation"],
  });
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;

/* --------------------------------------------------------------------------
   Profil
   -------------------------------------------------------------------------- */

export const identitySchema = z.object({ firstName, displayName });
export type IdentityInput = z.infer<typeof identitySchema>;

/**
 * Choix d'avatar. La *forme* est validée ici ; l'appartenance de la valeur à
 * l'ensemble autorisé (palette d'emojis en base, codes des clubs de la saison)
 * est vérifiée dans l'action serveur, qui seule connaît la base.
 */
export const avatarSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("emoji"),
    value: z.string().trim().min(1, { error: "Choisis un emoji." }).max(12),
  }),
  z.object({
    kind: z.literal("club"),
    value: z.string().trim().min(1, { error: "Choisis un club." }).max(12),
  }),
  z.object({ kind: z.literal("photo") }),
]);
export type AvatarInput = z.infer<typeof avatarSchema>;

/**
 * Fichier téléversé. Les bornes viennent de `app_settings`
 * (`avatar.max_bytes`, `avatar.allowed_mime`) : rien n'est codé en dur.
 * Le type déclaré par le navigateur n'est qu'un premier filtre — l'action
 * serveur renifle ensuite les octets réels du fichier.
 */
export function avatarFileSchema(maxBytes: number, allowedMime: readonly string[]) {
  const megabytes = (maxBytes / (1024 * 1024)).toFixed(
    maxBytes % (1024 * 1024) === 0 ? 0 : 1,
  );
  return z
    .instanceof(File, { error: "Aucun fichier reçu." })
    .refine((f) => f.size > 0, { error: "Le fichier est vide." })
    .refine((f) => f.size <= maxBytes, {
      error: `Image trop lourde : ${megabytes} Mo maximum.`,
    })
    .refine((f) => allowedMime.includes(f.type), {
      error: `Format non accepté. Formats acceptés : ${allowedMime
        .map((m) => m.replace("image/", "").toUpperCase())
        .join(", ")}.`,
    });
}
