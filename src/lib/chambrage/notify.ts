/**
 * Les notifications de Chambrage : nouveau message, réponse, réaction.
 *
 * Même idiome que `feed/notify.ts` (mots du Vestiaire) : tous les membres de
 * la ligue sont prévenus d'un nouveau message, sauf son auteur — être
 * notifié de soi-même n'a jamais amusé personne. Le destinataire d'une
 * réponse directe reçoit un titre différent, plus personnel, plutôt qu'un
 * « nouveau message » générique noyé dans le reste.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueue, flushDue } from "@/lib/push/notify";
import { dedupeKey } from "@/lib/push/schedule";
import { excerpt } from "../feed/post-notice.ts";

export const CHAT_MESSAGE_KIND = "chat_message";
export const CHAT_REPLY_KIND = "chat_reply";
export const CHAT_REACTION_KIND = "chat_reaction";

export interface NewMessageNotice {
  messageId: string;
  leagueId: string;
  senderId: string;
  senderName: string;
  /** Déjà mis en forme : « 📷 Photo » pour un message image. */
  preview: string;
  /** L'auteur du message cité, si celui-ci répond à quelqu'un. */
  replyToSenderId: string | null;
}

export async function notifyNewMessage(
  admin: SupabaseClient,
  notice: NewMessageNotice,
): Promise<number> {
  const { data: members } = await admin
    .from("league_members")
    .select("user_id")
    .eq("league_id", notice.leagueId);

  let queued = 0;
  for (const member of (members ?? []) as Array<{ user_id: string }>) {
    if (member.user_id === notice.senderId) continue;

    const isReplyTarget = notice.replyToSenderId === member.user_id;
    const kind = isReplyTarget ? CHAT_REPLY_KIND : CHAT_MESSAGE_KIND;
    const title = isReplyTarget
      ? `↩️ ${notice.senderName} t'a répondu`
      : `💬 ${notice.senderName}`;

    const outcome = await enqueue(
      admin,
      {
        userId: member.user_id,
        kind,
        title,
        body: excerpt(notice.preview),
        url: "/vestiaire",
        dedupeKey: dedupeKey(kind, `${notice.messageId}:${member.user_id}`),
      },
      // Une conversation ne doit pas attendre le prochain passage du
      // planificateur, comme les mots du Vestiaire.
      { ignoreDailyCap: true },
    );
    if (outcome === "queued") queued += 1;
  }

  if (queued > 0) await flushDue(admin);
  return queued;
}

export interface NewReactionNotice {
  messageId: string;
  reactorId: string;
  reactorName: string;
  emoji: string;
  /** L'auteur du message réagi. */
  targetUserId: string;
}

/** Réagir à son propre message ne notifie jamais personne. */
export async function notifyReaction(
  admin: SupabaseClient,
  notice: NewReactionNotice,
): Promise<boolean> {
  if (notice.targetUserId === notice.reactorId) return false;

  const outcome = await enqueue(
    admin,
    {
      userId: notice.targetUserId,
      kind: CHAT_REACTION_KIND,
      title: `${notice.emoji} ${notice.reactorName} a réagi`,
      body: "à ton message dans Chambrage.",
      url: "/vestiaire",
      dedupeKey: dedupeKey(CHAT_REACTION_KIND, `${notice.messageId}:${notice.reactorId}`),
    },
    { ignoreDailyCap: true },
  );
  return outcome === "queued";
}
