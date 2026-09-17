/**
 * La notification d'un mot publié dans le Vestiaire.
 *
 * C'est ce qui fait vivre l'application entre deux journées : un message qui
 * n'atteint personne ne fait rire personne. Tous les membres de la ligue sont
 * prévenus, sauf l'auteur — être notifié de son propre message n'a jamais
 * amusé personne non plus.
 *
 * La mise en forme est pure et testée ; l'envoi vit dans `notifyNewPost`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueue, flushDue } from "@/lib/push/notify";
import { dedupeKey } from "@/lib/push/schedule";
import { excerpt, postTitle, FEED_POST_KIND } from "./post-notice.ts";

export { excerpt, postTitle, FEED_POST_KIND, EXCERPT_MAX } from "./post-notice.ts";

export interface NewPostNotice {
  postId: string;
  leagueId: string;
  authorId: string;
  authorName: string;
  body: string;
}

export async function notifyNewPost(
  admin: SupabaseClient,
  notice: NewPostNotice,
): Promise<number> {
  const { data: members } = await admin
    .from("league_members")
    .select("user_id")
    .eq("league_id", notice.leagueId);

  let queued = 0;
  for (const member of (members ?? []) as Array<{ user_id: string }>) {
    if (member.user_id === notice.authorId) continue;
    const outcome = await enqueue(
      admin,
      {
        userId: member.user_id,
        kind: FEED_POST_KIND,
        title: postTitle(notice.authorName),
        body: excerpt(notice.body),
        url: "/vestiaire",
        dedupeKey: dedupeKey(FEED_POST_KIND, notice.postId),
      },
      // Un mot du Vestiaire est écrit par un joueur, pas par le planificateur :
      // le plafond quotidien protège des alertes automatiques, pas d'une
      // conversation. Les heures de silence, elles, s'appliquent toujours.
      { ignoreDailyCap: true },
    );
    if (outcome === "queued") queued += 1;
  }

  // Une chambrade qui arrive une heure plus tard ne fait plus rire : on ne
  // laisse pas ces messages attendre le prochain passage du planificateur.
  if (queued > 0) await flushDue(admin);
  return queued;
}
