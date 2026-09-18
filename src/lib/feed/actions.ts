"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewPost } from "./notify.ts";
import { markFeedRead } from "./unread.ts";
import { loadSettings, setting } from "@/lib/settings";
import { getViewer } from "@/lib/auth/session";
import { failure, success, type ActionState } from "@/lib/auth/action-state";

/** Réactions et mots du Vestiaire. Écrits par le joueur, sous RLS. */

const reactionSchema = z.object({
  postId: z.string().uuid(),
  emoji: z.string().min(1).max(8),
});

/** Ajoute la réaction, ou la retire si elle y est déjà. */
export async function toggleReaction(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) return;

  const parsed = reactionSchema.safeParse({
    postId: formData.get("postId"),
    emoji: formData.get("emoji"),
  });
  if (!parsed.success) return;

  const sb = await createClient();
  const settings = await loadSettings(sb);
  const allowed = setting<string[]>(settings, "feed.reactions", []);
  // On n'accepte que les emojis proposés : le champ vient du navigateur.
  if (allowed.length > 0 && !allowed.includes(parsed.data.emoji)) return;

  const { data: existing } = await sb
    .from("reactions")
    .select("post_id")
    .eq("post_id", parsed.data.postId)
    .eq("user_id", viewer.id)
    .eq("emoji", parsed.data.emoji)
    .maybeSingle();

  if (existing) {
    await sb.from("reactions").delete()
      .eq("post_id", parsed.data.postId)
      .eq("user_id", viewer.id)
      .eq("emoji", parsed.data.emoji);
  } else {
    await sb.from("reactions").insert({
      post_id: parsed.data.postId,
      user_id: viewer.id,
      emoji: parsed.data.emoji,
    });
  }

  revalidatePath("/vestiaire");
}

/** Publie un mot dans le Vestiaire d'une ligue. */
export async function publishPost(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewer) return failure("Connexion requise.");

  const sb = await createClient();
  const settings = await loadSettings(sb);
  const maxLength = setting<number>(settings, "feed.post_max_length", 500);

  const parsed = z
    .object({
      body: z.string().trim().min(1).max(maxLength),
      leagueId: z.string().uuid(),
    })
    .safeParse({ body: formData.get("body"), leagueId: formData.get("leagueId") });

  if (!parsed.success) {
    return failure(`Un message entre 1 et ${maxLength} caractères.`);
  }

  // `feed_posts_insert` (RLS) refuse déjà toute ligue dont le joueur n'est
  // pas membre : pas besoin de le revérifier ici.
  const { data: inserted, error } = await sb
    .from("feed_posts")
    .insert({
      league_id: parsed.data.leagueId,
      author_id: viewer.id,
      body: parsed.data.body,
    })
    .select("id")
    .single();
  if (error || !inserted) return failure("La publication a échoué. Réessaie dans un instant.");

  // Prévenir le groupe fait partie de la publication, mais pas au point de la
  // retarder : prévenir cinq joueurs, c'est cinq envois Web Push, et l'auteur
  // regarderait son bouton tourner pendant ce temps. `after()` diffère tout ça
  // au-delà de la réponse — le message s'affiche tout de suite, les
  // notifications partent juste après.
  //
  // Et une notification qui échoue ne doit jamais faire croire à l'auteur
  // qu'il a perdu son mot : il est écrit, il est en ligne.
  const postId = inserted.id as string;
  const { leagueId } = parsed.data;
  const body = parsed.data.body;
  after(async () => {
    try {
      const admin = createAdminClient();
      const { data: author } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", viewer.id)
        .maybeSingle();

      await notifyNewPost(admin, {
        postId,
        leagueId,
        authorId: viewer.id,
        authorName: (author?.display_name as string) ?? "Quelqu'un",
        body,
      });
    } catch (cause) {
      console.error("[vestiaire] notification du message impossible", cause);
    }
  });

  revalidatePath("/vestiaire");
  return success("Publié.");
}

/**
 * Marque le Vestiaire d'une ligue comme lu, pour le joueur connecté.
 *
 * Appelée à l'ouverture de l'écran. Strictement personnelle : RLS n'autorise
 * l'écriture que de sa propre ligne, et lire le fil n'éteint la pastille que
 * pour soi — les autres gardent la leur tant qu'ils n'ont pas ouvert.
 */
export async function markVestiaireRead(leagueId: string): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) return;

  const parsed = z.string().uuid().safeParse(leagueId);
  if (!parsed.success) return;

  const sb = await createClient();
  // Un échec ici n'a aucune conséquence visible : la pastille restera
  // allumée, ce qui est le comportement sûr. On ne dérange pas le joueur.
  try {
    await markFeedRead(sb, viewer.id, parsed.data);
  } catch (cause) {
    console.error("[vestiaire] impossible de marquer le fil comme lu", cause);
  }
}
