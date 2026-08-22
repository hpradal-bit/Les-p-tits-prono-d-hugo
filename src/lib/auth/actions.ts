"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { flattenError, type ZodError } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSettings, setting } from "@/lib/settings";
import { type ActionState, failure, success } from "@/lib/auth/action-state";
import { requireViewer } from "@/lib/auth/session";
import {
  AVATAR_BUCKET,
  extensionFor,
  sniffImageType,
  storagePathFromPublicUrl,
} from "@/lib/auth/avatars";
import { loadAvatarPolicy, loadClubAvatars } from "@/lib/auth/avatar-policy";
import {
  avatarFileSchema,
  avatarSchema,
  forgotPasswordSchema,
  identitySchema,
  newPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/schemas";

/**
 * Chantier A — actions serveur des comptes et des profils.
 *
 * Trois principes appliqués partout dans ce fichier :
 *   1. Zod d'abord. Aucune valeur ne touche la base sans être passée par un
 *      schéma, même si l'écran l'a déjà vérifiée (règle non négociable n° 7).
 *   2. La clé `service_role` ne sert qu'à ce que RLS interdit à juste titre au
 *      joueur : lire `groups.invite_code` avant d'être membre, créer le compte,
 *      poser la ligne `profiles` et la ligne `group_members`. Tout le reste
 *      passe par le client soumis à RLS.
 *   3. Les messages restent vagues sur l'existence d'un compte : le formulaire
 *      ne doit pas devenir un détecteur d'adresses inscrites.
 */

const fieldsOf = (error: ZodError) =>
  flattenError(error).fieldErrors as Record<string, string[]>;

/** Base publique du site, pour les liens envoyés par courriel. */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/* ==========================================================================
   INSCRIPTION
   ========================================================================== */

/**
 * Inscription par code d'invitation, **sans confirmation d'e-mail**.
 *
 * Choix produit assumé : 6 amis, un groupe fermé, et une seule bonne façon de
 * perdre quelqu'un — lui demander d'aller chercher un courriel tombé dans les
 * indésirables la veille de la J1. Le code d'invitation fait office de filtre,
 * et il est vérifié ici, côté serveur, contre `groups.invite_code`.
 */
export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    inviteCode: formData.get("inviteCode"),
    firstName: formData.get("firstName"),
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return failure("Le formulaire comporte des erreurs.", fieldsOf(parsed.error));
  }

  const { inviteCode, firstName, displayName, email, password } = parsed.data;
  const admin = createAdminClient();

  /* --- 1. Le code d'invitation -------------------------------------------
     `groups.invite_code` est de type citext : la comparaison ignore la casse.
     La lecture passe par la clé de service parce que RLS réserve `groups` aux
     membres du groupe — et on ne l'est justement pas encore. */
  const settings = await loadSettings(admin);
  const codeRequired = setting<boolean>(settings, "signup.invite_code_required", true);

  const groupQuery = admin.from("groups").select("id, active_season_id");
  const { data: group, error: groupError } = codeRequired
    ? await groupQuery.eq("invite_code", inviteCode).maybeSingle()
    : await groupQuery.order("created_at").limit(1).maybeSingle();

  if (groupError) {
    return failure("Impossible de vérifier le code pour le moment. Réessaie dans un instant.");
  }
  if (!group) {
    return failure("Code d'invitation inconnu.", {
      inviteCode: ["Ce code ne correspond à aucun groupe."],
    });
  }

  /* --- 2. Le compte ------------------------------------------------------
     `email_confirm: true` marque l'adresse comme confirmée dès la création :
     aucun courriel n'est envoyé, le joueur enchaîne directement sur le jeu. */
  const avatarKind = setting<string>(settings, "avatar.default_kind", "emoji");
  const avatarValue = setting<string>(settings, "avatar.default_value", "🏉");

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, display_name: displayName },
  });

  if (createError || !created?.user) {
    const raw = (createError?.message ?? "").toLowerCase();
    if (raw.includes("already") || raw.includes("registered") || raw.includes("exists")) {
      return failure("Un compte existe déjà avec cette adresse.", {
        email: ["Cette adresse est déjà utilisée. Connecte-toi plutôt."],
      });
    }
    if (raw.includes("rate") || raw.includes("too many")) {
      return failure("Trop de tentatives. Réessaie dans quelques minutes.");
    }
    return failure("La création du compte a échoué. Réessaie dans un instant.");
  }

  const userId = created.user.id;

  /* --- 3. Profil et appartenance au groupe -------------------------------
     Si l'une des deux écritures échoue, on efface le compte : mieux vaut aucun
     compte qu'un compte orphelin, incapable de lire quoi que ce soit puisque
     toutes les politiques RLS passent par `is_member()`. */
  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    first_name: firstName,
    display_name: displayName,
    avatar_kind: avatarKind,
    avatar_value: avatarValue,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    return failure("La création du profil a échoué. Réessaie dans un instant.");
  }

  const { error: memberError } = await admin.from("group_members").insert({
    group_id: group.id,
    user_id: userId,
    role: "player",
  });
  if (memberError) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    return failure("Le rattachement au groupe a échoué. Réessaie dans un instant.");
  }

  /* --- 4. Événement de jeu -----------------------------------------------
     Règle non négociable n° 8 : le fil social, les badges et les notifications
     lisent `events`. Ils ne devinent rien de leur côté. */
  await admin.from("events").insert({
    kind: "member_joined",
    season_id: group.active_season_id,
    actor_id: userId,
    payload: { group_id: group.id, display_name: displayName },
  });

  /* --- 5. Ouverture de la session ---------------------------------------- */
  const sb = await createClient();
  const { error: signInError } = await sb.auth.signInWithPassword({ email, password });
  if (signInError) {
    // Le compte existe bel et bien : on renvoie vers la connexion plutôt que
    // d'inquiéter le joueur avec une erreur.
    redirect("/connexion?inscrit=1");
  }

  revalidatePath("/", "layout");
  redirect("/");
}

/* ==========================================================================
   CONNEXION / DÉCONNEXION
   ========================================================================== */

/**
 * Destination après connexion. Le middleware mémorise l'écran demandé dans
 * `?suite=` ; on ne suit qu'un chemin interne, jamais une URL absolue qu'un
 * lien piégé aurait pu glisser dans la barre d'adresse.
 */
function safeSuite(raw: FormDataEntryValue | null): string {
  if (typeof raw !== "string") return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return failure("Le formulaire comporte des erreurs.", fieldsOf(parsed.error));
  }

  const sb = await createClient();
  const { error } = await sb.auth.signInWithPassword(parsed.data);

  if (error) {
    const raw = error.message.toLowerCase();
    if (raw.includes("rate") || raw.includes("too many")) {
      return failure("Trop de tentatives. Réessaie dans quelques minutes.");
    }
    // Message unique, volontairement flou : il ne dit pas si l'adresse existe.
    return failure("E-mail ou mot de passe incorrect.");
  }

  revalidatePath("/", "layout");
  redirect(safeSuite(formData.get("suite")));
}

export async function signOut(): Promise<void> {
  const sb = await createClient();
  await sb.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/connexion");
}

/* ==========================================================================
   MOT DE PASSE OUBLIÉ
   ========================================================================== */

/**
 * Envoie le lien de réinitialisation. L'admin peut également réinitialiser un
 * mot de passe depuis son espace (chantier E) : cet écran est le chemin normal,
 * celui qui ne dérange personne un samedi soir.
 */
export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return failure("Le formulaire comporte des erreurs.", fieldsOf(parsed.error));
  }

  const sb = await createClient();
  const origin = await siteOrigin();
  await sb.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/callback?next=%2Fnouveau-mot-de-passe`,
  });

  // Réponse identique que l'adresse existe ou non.
  return success(
    "Si un compte existe avec cette adresse, le lien de réinitialisation vient de partir. Pense à regarder dans les indésirables.",
  );
}

/** Pose le nouveau mot de passe. Exige la session ouverte par le lien reçu. */
export async function updatePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) {
    return failure("Le formulaire comporte des erreurs.", fieldsOf(parsed.error));
  }

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return failure("Ce lien a expiré. Demande-en un nouveau depuis « Mot de passe oublié ».");
  }

  const { error } = await sb.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return failure("Le mot de passe n'a pas pu être changé. Réessaie dans un instant.");
  }

  revalidatePath("/", "layout");
  redirect("/mon-compte?motdepasse=1");
}

/* ==========================================================================
   PROFIL
   ========================================================================== */

export async function updateIdentity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const viewer = await requireViewer();

  const parsed = identitySchema.safeParse({
    firstName: formData.get("firstName"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    return failure("Le formulaire comporte des erreurs.", fieldsOf(parsed.error));
  }

  // Client soumis à RLS : la politique `profiles_update_self` garantit qu'on ne
  // modifie que sa propre ligne, quoi que le formulaire ait envoyé.
  const sb = await createClient();
  const { error } = await sb
    .from("profiles")
    .update({ first_name: parsed.data.firstName, display_name: parsed.data.displayName })
    .eq("id", viewer.id);

  if (error) return failure("L'enregistrement a échoué. Réessaie dans un instant.");

  revalidatePath("/", "layout");
  return success("Profil mis à jour.");
}

/**
 * Change l'avatar : emoji de la palette, logo d'un club, ou photo téléversée.
 *
 * Le téléversement est contrôlé **côté serveur** de bout en bout :
 *   · taille et type déclarés validés par Zod, bornes lues dans `app_settings` ;
 *   · octets réellement reçus reniflés — un exécutable renommé `.png` est rejeté ;
 *   · nom de fichier et extension imposés par le serveur, jamais repris du
 *     client ; le fichier atterrit dans un dossier portant l'identifiant de
 *     l'utilisateur, le seul où les politiques Storage l'autorisent à écrire.
 */
export async function updateAvatar(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const viewer = await requireViewer();
  const sb = await createClient();
  const policy = await loadAvatarPolicy(sb);

  const parsed = avatarSchema.safeParse({
    kind: formData.get("kind"),
    value: formData.get("value") ?? undefined,
  });
  if (!parsed.success) {
    return failure("Choix d'avatar invalide.", fieldsOf(parsed.error));
  }

  let nextKind: string;
  let nextValue: string;

  if (parsed.data.kind === "emoji") {
    if (!policy.emojis.includes(parsed.data.value)) {
      return failure("Cet emoji ne fait pas partie de la palette.");
    }
    nextKind = "emoji";
    nextValue = parsed.data.value;
  } else if (parsed.data.kind === "club") {
    const code = parsed.data.value;
    const clubs = await loadClubAvatars(sb);
    if (!clubs.some((c) => c.code === code)) {
      return failure("Ce club n'existe pas.");
    }
    nextKind = "club";
    nextValue = code;
  } else {
    const checked = avatarFileSchema(policy.maxBytes, policy.allowedMime).safeParse(
      formData.get("file"),
    );
    if (!checked.success) {
      return failure(checked.error.issues[0]?.message ?? "Fichier invalide.", {
        file: checked.error.issues.map((i) => i.message),
      });
    }

    const bytes = new Uint8Array(await checked.data.arrayBuffer());

    // Le navigateur annonce ce qu'il veut : on relit la taille réelle…
    if (bytes.byteLength > policy.maxBytes) {
      return failure("Image trop lourde.", { file: ["Image trop lourde."] });
    }

    // …puis le vrai type, à partir des premiers octets du fichier.
    const sniffed = sniffImageType(bytes.subarray(0, 16));
    const extension = sniffed ? extensionFor(sniffed) : null;
    if (!sniffed || !extension || !policy.allowedMime.includes(sniffed)) {
      return failure("Ce fichier n'est pas une image reconnue.", {
        file: ["Ce fichier n'est pas une image reconnue."],
      });
    }

    const path = `${viewer.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await sb.storage.from(AVATAR_BUCKET).upload(path, bytes, {
      contentType: sniffed,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      return failure("Le téléversement a échoué. Réessaie dans un instant.");
    }

    const {
      data: { publicUrl },
    } = sb.storage.from(AVATAR_BUCKET).getPublicUrl(path);

    nextKind = "photo";
    nextValue = publicUrl;
  }

  const previousPhoto =
    viewer.avatarKind === "photo" ? storagePathFromPublicUrl(viewer.avatarValue) : null;

  const { error } = await sb
    .from("profiles")
    .update({ avatar_kind: nextKind, avatar_value: nextValue })
    .eq("id", viewer.id);

  if (error) return failure("L'enregistrement a échoué. Réessaie dans un instant.");

  // La nouvelle valeur est en base : l'ancienne photo n'a plus de raison
  // d'occuper le quota gratuit. Un échec ici n'est pas bloquant.
  if (previousPhoto && previousPhoto !== storagePathFromPublicUrl(nextValue)) {
    await sb.storage.from(AVATAR_BUCKET).remove([previousPhoto]);
  }

  revalidatePath("/", "layout");
  return success("Avatar mis à jour.");
}
