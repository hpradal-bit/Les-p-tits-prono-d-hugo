"use server";

/**
 * Écritures de Chambrage. RLS applique déjà l'appartenance à la ligue
 * (règle n° 3) : ces actions valident la forme, jamais le droit d'écrire —
 * ça, la base le refuse déjà toute seule si on se trompe.
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/auth/session";
import { loadSettings, setting } from "@/lib/settings";
import { sniffImageType, extensionFor } from "@/lib/auth/avatars";
import { avatarFileSchema } from "@/lib/auth/schemas";
import { loadLeagueRoster } from "../standings/queries.ts";
import { CHAMBRAGE_MEDIA_BUCKET, ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES } from "./media.ts";
import { notifyNewMessage, notifyReaction } from "./notify.ts";
import { loadMessageById } from "./queries.ts";
import { parseMentions, type RawMessage, type RawPollOption } from "./model.ts";
import { GifProviderError, isTenorMediaUrl, searchGifs, type GifResult } from "./gif-provider.ts";

export type ChambrageResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail<T>(error: string): ChambrageResult<T> {
  return { ok: false, error };
}
function ok<T>(data: T): ChambrageResult<T> {
  return { ok: true, data };
}

function toMessage(row: Record<string, unknown>): RawMessage {
  return {
    id: row.id as string,
    senderId: (row.sender_id as string | null) ?? null,
    messageType: row.message_type as RawMessage["messageType"],
    body: (row.body as string | null) ?? null,
    mediaUrl: (row.media_url as string | null) ?? null,
    replyToId: (row.reply_to_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    deletedAt: (row.deleted_at as string | null) ?? null,
    pollAllowsMultiple: (row.poll_allows_multiple as boolean | null) ?? null,
  };
}

const MESSAGE_COLUMNS =
  "id, sender_id, message_type, body, media_url, reply_to_id, created_at, updated_at, deleted_at, poll_allows_multiple";

/**
 * Après l'écriture : prévenir la ligue, sans jamais retarder l'envoi lui-même
 * (`after()`) ni faire échouer l'action si une notification se plante.
 */
function scheduleMessageNotification(params: {
  message: RawMessage;
  leagueId: string;
  senderName: string;
  preview: string;
}): void {
  after(async () => {
    try {
      const admin = createAdminClient();
      let replyToSenderId: string | null = null;
      if (params.message.replyToId) {
        const original = await loadMessageById(admin, params.message.replyToId);
        replyToSenderId = original?.senderId ?? null;
      }
      const roster = await loadLeagueRoster(admin, params.leagueId);
      const mentionedUserIds = params.message.body
        ? parseMentions(params.message.body, roster)
        : [];
      await notifyNewMessage(admin, {
        messageId: params.message.id,
        leagueId: params.leagueId,
        senderId: params.message.senderId ?? "",
        senderName: params.senderName,
        preview: params.preview,
        replyToSenderId,
        mentionedUserIds,
      });
    } catch (cause) {
      console.error("[chambrage] notification de message impossible", cause);
    }
  });
}

const textSchema = z.object({
  leagueId: z.string().uuid(),
  body: z.string().trim().min(1),
  replyToId: z.string().uuid().nullable(),
});

export async function sendTextMessage(input: {
  leagueId: string;
  body: string;
  replyToId?: string | null;
}): Promise<ChambrageResult<RawMessage>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Connexion requise.");

  const sb = await createClient();
  const settings = await loadSettings(sb);
  const maxLength = setting<number>(settings, "feed.post_max_length", 500);

  const parsed = textSchema.safeParse({
    leagueId: input.leagueId,
    body: input.body,
    replyToId: input.replyToId ?? null,
  });
  if (!parsed.success) return fail("Message invalide.");
  if (parsed.data.body.length > maxLength) {
    return fail(`${maxLength} caractères maximum.`);
  }

  const { data, error } = await sb
    .from("messages")
    .insert({
      league_id: parsed.data.leagueId,
      sender_id: viewer.id,
      message_type: "text",
      body: parsed.data.body,
      reply_to_id: parsed.data.replyToId,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error || !data) return fail("L'envoi a échoué. Réessaie dans un instant.");

  const message = toMessage(data);
  scheduleMessageNotification({
    message,
    leagueId: parsed.data.leagueId,
    senderName: viewer.displayName,
    preview: message.body ?? "",
  });

  revalidatePath("/vestiaire");
  return ok(message);
}

export async function sendImageMessage(formData: FormData): Promise<ChambrageResult<RawMessage>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Connexion requise.");

  const leagueId = z.string().uuid().safeParse(formData.get("leagueId"));
  if (!leagueId.success) return fail("Ligue invalide.");

  const replyToRaw = formData.get("replyToId");
  const replyToId = typeof replyToRaw === "string" && replyToRaw.length > 0 ? replyToRaw : null;
  if (replyToId && !z.string().uuid().safeParse(replyToId).success) return fail("Réponse invalide.");

  const captionRaw = formData.get("caption");
  const caption = typeof captionRaw === "string" && captionRaw.trim().length > 0 ? captionRaw.trim() : null;

  const checked = avatarFileSchema(MAX_IMAGE_BYTES, ALLOWED_IMAGE_MIME).safeParse(formData.get("file"));
  if (!checked.success) {
    return fail(checked.error.issues[0]?.message ?? "Fichier invalide.");
  }

  const bytes = new Uint8Array(await checked.data.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) return fail("Image trop lourde.");

  const sniffed = sniffImageType(bytes.subarray(0, 16));
  const extension = sniffed ? extensionFor(sniffed) : null;
  if (!sniffed || !extension || !(ALLOWED_IMAGE_MIME as readonly string[]).includes(sniffed)) {
    return fail("Ce fichier n'est pas une image reconnue.");
  }

  const sb = await createClient();
  const path = `${leagueId.data}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await sb.storage.from(CHAMBRAGE_MEDIA_BUCKET).upload(path, bytes, {
    contentType: sniffed,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) return fail("Le téléversement a échoué. Réessaie dans un instant.");

  const {
    data: { publicUrl },
  } = sb.storage.from(CHAMBRAGE_MEDIA_BUCKET).getPublicUrl(path);

  const { data, error } = await sb
    .from("messages")
    .insert({
      league_id: leagueId.data,
      sender_id: viewer.id,
      message_type: "image",
      media_url: publicUrl,
      body: caption,
      reply_to_id: replyToId,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error || !data) {
    await sb.storage.from(CHAMBRAGE_MEDIA_BUCKET).remove([path]);
    return fail("L'envoi a échoué. Réessaie dans un instant.");
  }

  const message = toMessage(data);
  scheduleMessageNotification({
    message,
    leagueId: leagueId.data,
    senderName: viewer.displayName,
    preview: caption ? `📷 ${caption}` : "📷 Photo",
  });

  revalidatePath("/vestiaire");
  return ok(message);
}

/** Recherche de GIF (Tenor) pour le sélecteur du composer. */
export async function searchGifsAction(query: string): Promise<ChambrageResult<GifResult[]>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Connexion requise.");

  try {
    return ok(await searchGifs(query));
  } catch (cause) {
    const message = cause instanceof GifProviderError ? cause.message : "La recherche a échoué.";
    return fail(message);
  }
}

const gifSchema = z.object({
  leagueId: z.string().uuid(),
  gifUrl: z.string().url(),
  replyToId: z.string().uuid().nullable(),
});

/** Envoie un GIF choisi dans le sélecteur — un message image, l'URL Tenor jamais re-téléversée. */
export async function sendGifMessage(input: {
  leagueId: string;
  gifUrl: string;
  replyToId?: string | null;
}): Promise<ChambrageResult<RawMessage>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Connexion requise.");

  const parsed = gifSchema.safeParse({
    leagueId: input.leagueId,
    gifUrl: input.gifUrl,
    replyToId: input.replyToId ?? null,
  });
  if (!parsed.success || !isTenorMediaUrl(parsed.data.gifUrl)) {
    return fail("GIF invalide.");
  }

  const sb = await createClient();
  const { data, error } = await sb
    .from("messages")
    .insert({
      league_id: parsed.data.leagueId,
      sender_id: viewer.id,
      message_type: "image",
      media_url: parsed.data.gifUrl,
      reply_to_id: parsed.data.replyToId,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error || !data) return fail("L'envoi a échoué. Réessaie dans un instant.");

  const message = toMessage(data);
  scheduleMessageNotification({
    message,
    leagueId: parsed.data.leagueId,
    senderName: viewer.displayName,
    preview: "🎞️ GIF",
  });

  revalidatePath("/vestiaire");
  return ok(message);
}

const pollSchema = z.object({
  leagueId: z.string().uuid(),
  question: z.string().trim().min(1),
  options: z.array(z.string().trim().min(1)).min(2).max(10),
  allowsMultiple: z.boolean(),
  replyToId: z.string().uuid().nullable(),
});

export interface SentPoll {
  message: RawMessage;
  options: RawPollOption[];
}

/** Un sondage, comme sur WhatsApp : une question, 2 à 10 réponses, réponses multiples en option. */
export async function sendPollMessage(input: {
  leagueId: string;
  question: string;
  options: string[];
  allowsMultiple: boolean;
  replyToId?: string | null;
}): Promise<ChambrageResult<SentPoll>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Connexion requise.");

  const parsed = pollSchema.safeParse({
    leagueId: input.leagueId,
    question: input.question,
    options: input.options,
    allowsMultiple: input.allowsMultiple,
    replyToId: input.replyToId ?? null,
  });
  if (!parsed.success) return fail("Sondage invalide : 2 à 10 réponses, une question non vide.");

  const sb = await createClient();

  const { data, error } = await sb
    .from("messages")
    .insert({
      league_id: parsed.data.leagueId,
      sender_id: viewer.id,
      message_type: "poll",
      body: parsed.data.question,
      poll_allows_multiple: parsed.data.allowsMultiple,
      reply_to_id: parsed.data.replyToId,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error || !data) return fail("L'envoi a échoué. Réessaie dans un instant.");

  const message = toMessage(data);

  const { data: optionRows, error: optionsError } = await sb
    .from("poll_options")
    .insert(
      parsed.data.options.map((label, position) => ({
        message_id: message.id,
        position,
        label,
      })),
    )
    .select("id, message_id, position, label");
  if (optionsError || !optionRows) {
    // Le message est écrit mais sans ses réponses : on le supprime plutôt que
    // de laisser un sondage muet dans la conversation.
    await sb.from("messages").delete().eq("id", message.id);
    return fail("L'envoi a échoué. Réessaie dans un instant.");
  }

  const options: RawPollOption[] = (
    optionRows as Array<{ id: string; message_id: string; position: number; label: string }>
  ).map((o) => ({ id: o.id, messageId: o.message_id, position: o.position, label: o.label }));

  scheduleMessageNotification({
    message,
    leagueId: parsed.data.leagueId,
    senderName: viewer.displayName,
    preview: `📊 ${parsed.data.question}`,
  });

  revalidatePath("/vestiaire");
  return ok({ message, options });
}

const voteSchema = z.object({ optionId: z.string().uuid(), allowsMultiple: z.boolean() });

/**
 * Vote pour une option — la retire si elle y était déjà (on change d'avis).
 * Si le sondage n'accepte qu'une réponse, les autres votes du même joueur
 * sur ce sondage sont retirés d'abord : une seule case cochée à la fois.
 */
export async function votePoll(input: {
  optionId: string;
  allowsMultiple: boolean;
}): Promise<ChambrageResult<{ removed: boolean }>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Connexion requise.");

  const parsed = voteSchema.safeParse(input);
  if (!parsed.success) return fail("Vote invalide.");

  const sb = await createClient();

  const { data: existing } = await sb
    .from("poll_votes")
    .select("option_id")
    .eq("option_id", parsed.data.optionId)
    .eq("user_id", viewer.id)
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from("poll_votes")
      .delete()
      .eq("option_id", parsed.data.optionId)
      .eq("user_id", viewer.id);
    if (error) return fail("Le retrait a échoué.");
    revalidatePath("/vestiaire");
    return ok({ removed: true });
  }

  if (!parsed.data.allowsMultiple) {
    const { data: option } = await sb
      .from("poll_options")
      .select("message_id")
      .eq("id", parsed.data.optionId)
      .maybeSingle();
    if (option) {
      const { data: siblings } = await sb
        .from("poll_options")
        .select("id")
        .eq("message_id", option.message_id);
      const siblingIds = ((siblings ?? []) as Array<{ id: string }>).map((s) => s.id);
      if (siblingIds.length > 0) {
        await sb.from("poll_votes").delete().eq("user_id", viewer.id).in("option_id", siblingIds);
      }
    }
  }

  const { error } = await sb
    .from("poll_votes")
    .insert({ option_id: parsed.data.optionId, user_id: viewer.id });
  if (error) return fail("Le vote a échoué.");

  revalidatePath("/vestiaire");
  return ok({ removed: false });
}

const editSchema = z.object({ messageId: z.string().uuid(), body: z.string().trim().min(1) });

export async function editMessage(input: {
  messageId: string;
  body: string;
}): Promise<ChambrageResult<null>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Connexion requise.");

  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return fail("Message invalide.");

  const sb = await createClient();
  // La policy `messages_update_own` refuse déjà le message d'un autre : une
  // ligne touchée à zéro dit juste "rien à faire", jamais une erreur bruyante.
  const { error } = await sb
    .from("messages")
    .update({ body: parsed.data.body, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.messageId)
    .eq("message_type", "text");
  if (error) return fail("La modification a échoué.");

  revalidatePath("/vestiaire");
  return ok(null);
}

const idSchema = z.string().uuid();

export async function deleteMessage(messageId: string): Promise<ChambrageResult<null>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Connexion requise.");
  const parsed = idSchema.safeParse(messageId);
  if (!parsed.success) return fail("Message invalide.");

  const sb = await createClient();
  // Le contenu reste en base (une réponse peut le citer) ; `deleted_at`
  // suffit à l'écran pour afficher « Message supprimé » à sa place.
  const { error } = await sb
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data);
  if (error) return fail("La suppression a échoué.");

  revalidatePath("/vestiaire");
  return ok(null);
}

const reactionSchema = z.object({ messageId: z.string().uuid(), emoji: z.string().min(1).max(8) });

/** Pose la réaction, la remplace si elle diffère, ou la retire si c'est la même. */
export async function toggleReaction(input: {
  messageId: string;
  emoji: string;
}): Promise<ChambrageResult<{ removed: boolean }>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Connexion requise.");

  const parsed = reactionSchema.safeParse(input);
  if (!parsed.success) return fail("Réaction invalide.");

  const sb = await createClient();
  const settings = await loadSettings(sb);
  const allowed = setting<string[]>(settings, "feed.reactions", []);
  if (allowed.length > 0 && !allowed.includes(parsed.data.emoji)) return fail("Emoji non autorisé.");

  const { data: existing } = await sb
    .from("message_reactions")
    .select("emoji")
    .eq("message_id", parsed.data.messageId)
    .eq("user_id", viewer.id)
    .maybeSingle();

  if (existing?.emoji === parsed.data.emoji) {
    const { error } = await sb
      .from("message_reactions")
      .delete()
      .eq("message_id", parsed.data.messageId)
      .eq("user_id", viewer.id);
    if (error) return fail("Le retrait a échoué.");
    revalidatePath("/vestiaire");
    return ok({ removed: true });
  }

  const { error } = await sb.from("message_reactions").upsert(
    { message_id: parsed.data.messageId, user_id: viewer.id, emoji: parsed.data.emoji },
    { onConflict: "message_id,user_id" },
  );
  if (error) return fail("La réaction a échoué.");

  after(async () => {
    try {
      const admin = createAdminClient();
      const target = await loadMessageById(admin, parsed.data.messageId);
      if (!target?.senderId) return;
      await notifyReaction(admin, {
        messageId: parsed.data.messageId,
        reactorId: viewer.id,
        reactorName: viewer.displayName,
        emoji: parsed.data.emoji,
        targetUserId: target.senderId,
      });
    } catch (cause) {
      console.error("[chambrage] notification de réaction impossible", cause);
    }
  });

  revalidatePath("/vestiaire");
  return ok({ removed: false });
}

const readSchema = z.object({ leagueId: z.string().uuid() });

/** Marque Chambrage comme lu, pour le joueur connecté, jusqu'à maintenant. */
export async function markChambrageRead(leagueId: string): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) return;
  const parsed = readSchema.safeParse({ leagueId });
  if (!parsed.success) return;

  const sb = await createClient();
  // Sans conséquence visible en cas d'échec : le badge non-lu reste allumé,
  // ce qui est le comportement sûr.
  await sb.from("message_reads").upsert(
    { league_id: parsed.data.leagueId, user_id: viewer.id, last_read_at: new Date().toISOString() },
    { onConflict: "league_id,user_id" },
  );
}
