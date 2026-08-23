"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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

/** Publie un mot dans le Vestiaire. */
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
    .object({ body: z.string().trim().min(1).max(maxLength) })
    .safeParse({ body: formData.get("body") });

  if (!parsed.success) {
    return failure(`Un message entre 1 et ${maxLength} caractères.`);
  }

  const { error } = await sb.from("feed_posts").insert({
    group_id: viewer.groupId,
    author_id: viewer.id,
    body: parsed.data.body,
  });
  if (error) return failure("La publication a échoué. Réessaie dans un instant.");

  revalidatePath("/vestiaire");
  return success("Publié.");
}
