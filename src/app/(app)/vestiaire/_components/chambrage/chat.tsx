"use client";

/**
 * Chambrage : la conversation de groupe temps réel de la ligue.
 *
 * Orchestre l'état local (messages, réactions, lectures, frappe), le temps
 * réel Supabase (Postgres Changes pour les messages/réactions/lectures,
 * Broadcast pour la frappe — jamais persistée), la pagination vers le haut,
 * le défilement intelligent et l'envoi optimiste.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PlayerAvatar } from "../../../_components/player-avatar";
import type { ClubAvatar } from "@/lib/auth/avatars";
import type { PlayerRef } from "@/lib/standings/engine";
import {
  daySeparatorLabel,
  firstUnreadId,
  groupReactions,
  mergeMessages,
  myReaction as computeMyReaction,
  notReadBy as computeNotReadBy,
  readBy as computeReadBy,
  readState as computeReadState,
  sameBurst,
  splitMentions,
  tallyPoll,
  type RawMessage,
  type RawPollOption,
  type RawPollVote,
  type RawReaction,
  type RawRead,
} from "@/lib/chambrage/model";
import {
  editMessage,
  deleteMessage,
  markChambrageRead,
  sendImageMessage,
  sendPollMessage,
  sendTextMessage,
  toggleReaction,
  votePoll,
} from "@/lib/chambrage/actions";
import { loadMessagesPage, loadPollOptionsFor, loadReactionsFor } from "@/lib/chambrage/queries";
import { MessageBubble } from "./bubble";
import { Composer } from "./composer";
import { ReactionDetailSheet } from "./reaction-sheet";
import type { MessageVM } from "./types";

export interface ChambrageInitial {
  messages: RawMessage[];
  hasMoreOlder: boolean;
  reactions: RawReaction[];
  pollOptions: RawPollOption[];
  pollVotes: RawPollVote[];
  reads: RawRead[];
  lastReadAt: string | null;
}

const TYPING_EXPIRY_MS = 4000;
const NEAR_BOTTOM_PX = 80;

/** L'événement que la barre de navigation écoute pour éteindre son badge sans attendre son prochain sondage. */
export const CHAMBRAGE_READ_EVENT = "chambrage:lu";

export function ChambrageChat({
  leagueId,
  leagueName,
  resumeHref,
  pouvoirsHref,
  viewerId,
  viewerName,
  roster,
  clubs,
  reactionChoices,
  initial,
}: {
  leagueId: string;
  leagueName: string;
  /** Vers l'écran « Résumé » (le narrateur automatique du jeu) — plein écran, on y retourne par ce lien. */
  resumeHref: string;
  /** Vers l'écran « Super-pouvoirs ». */
  pouvoirsHref: string;
  viewerId: string;
  viewerName: string;
  roster: PlayerRef[];
  clubs: ClubAvatar[];
  reactionChoices: string[];
  initial: ChambrageInitial;
}) {
  const sb = useMemo(() => createClient(), []);
  const rosterById = useMemo(() => new Map(roster.map((p) => [p.userId, p])), [roster]);
  const memberIds = useMemo(() => roster.map((p) => p.userId), [roster]);
  const others = useMemo(() => roster.filter((p) => p.userId !== viewerId), [roster, viewerId]);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);

  const [messages, setMessages] = useState<RawMessage[]>(initial.messages);
  const [reactions, setReactions] = useState<RawReaction[]>(initial.reactions);
  const [pollOptions, setPollOptions] = useState<RawPollOption[]>(initial.pollOptions);
  const [pollVotes, setPollVotes] = useState<RawPollVote[]>(initial.pollVotes);
  const [reads, setReads] = useState<RawRead[]>(initial.reads);
  const [hasMoreOlder, setHasMoreOlder] = useState(initial.hasMoreOlder);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<Record<string, "sending" | "error">>({});
  const [replyTo, setReplyTo] = useState<RawMessage | null>(null);
  const [editing, setEditing] = useState<RawMessage | null>(null);
  const [reactionSheetFor, setReactionSheetFor] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [newBelow, setNewBelow] = useState(0);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const myTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const oldestLoadedAt = useRef<string | null>(initial.messages[0]?.createdAt ?? null);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Premier rendu : tout en bas, comme n'importe quelle messagerie qu'on ouvre.
  useEffect(() => {
    scrollToBottom(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markRead = useCallback(() => {
    markChambrageRead(leagueId).catch(() => {});
    setReads((prev) => {
      const now = new Date().toISOString();
      const others = prev.filter((r) => r.userId !== viewerId);
      return [...others, { userId: viewerId, lastReadAt: now }];
    });
    window.dispatchEvent(new CustomEvent(CHAMBRAGE_READ_EVENT));
  }, [leagueId, viewerId]);

  // Ouvrir Chambrage vaut lecture : comme dans n'importe quelle messagerie,
  // les messages déjà chargés au premier rendu s'éteignent tout de suite.
  // Différé au tour de boucle suivant : un `setState` synchrone au corps de
  // l'effet enchaînerait un second rendu complet du composant.
  useEffect(() => {
    const timer = setTimeout(markRead, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- Temps réel : messages ------------------------------------------------ */
  useEffect(() => {
    const channel = sb
      .channel(`chambrage-messages-${leagueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `league_id=eq.${leagueId}` },
        (payload) => {
          if (payload.eventType === "DELETE") return; // suppression = soft delete (UPDATE), jamais un vrai DELETE ici
          const row = payload.new as Record<string, unknown>;
          const incoming: RawMessage = {
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
          setMessages((prev) => mergeMessages(prev, [incoming]));
          if (incoming.messageType === "poll") void loadPollOptionsFor(sb, [incoming.id]).then((opts) =>
            setPollOptions((prev) => mergePollOptions(prev, opts)),
          );

          const el = scrollRef.current;
          if (incoming.senderId !== viewerId) {
            if (el && stickToBottomRef.current) {
              requestAnimationFrame(() => scrollToBottom(true));
              markRead();
            } else {
              setNewBelow((n) => n + 1);
            }
          }
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, viewerId]);

  /* --- Temps réel : réactions ------------------------------------------------ */
  useEffect(() => {
    const channel = sb
      .channel(`chambrage-reactions-${leagueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown>;
          const messageId = row.message_id as string;
          setReactions((prev) => {
            const withoutThis = prev.filter(
              (r) => !(r.messageId === messageId && r.userId === (row.user_id as string)),
            );
            if (payload.eventType === "DELETE") return withoutThis;
            return [...withoutThis, { messageId, userId: row.user_id as string, emoji: row.emoji as string }];
          });
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  /* --- Temps réel : votes d'un sondage ---------------------------------------- */
  useEffect(() => {
    const channel = sb
      .channel(`chambrage-poll-votes-${leagueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "poll_votes" },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown>;
          const optionId = row.option_id as string;
          const userId = row.user_id as string;
          setPollVotes((prev) => {
            const withoutThis = prev.filter((v) => !(v.optionId === optionId && v.userId === userId));
            if (payload.eventType === "DELETE") return withoutThis;
            return [...withoutThis, { optionId, userId }];
          });
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  /* --- Temps réel : lectures (statut ✓✓) ------------------------------------- */
  useEffect(() => {
    const channel = sb
      .channel(`chambrage-reads-${leagueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reads", filter: `league_id=eq.${leagueId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (!row) return;
          setReads((prev) => [
            ...prev.filter((r) => r.userId !== row.user_id),
            { userId: row.user_id as string, lastReadAt: row.last_read_at as string },
          ]);
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  /* --- Présence : qui a Chambrage ouvert en ce moment, comme le « en ligne »
     de WhatsApp/Messenger ------------------------------------------------- */
  useEffect(() => {
    const channel = sb.channel(`chambrage-presence-${leagueId}`, {
      config: { presence: { key: viewerId } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        setOnlineIds(Object.keys(channel.presenceState()));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ at: new Date().toISOString() });
      });

    return () => {
      sb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, viewerId]);

  /* --- Frappe : Broadcast, jamais persisté ----------------------------------- */
  const typingChannelRef = useRef<ReturnType<typeof sb.channel> | null>(null);
  useEffect(() => {
    const channel = sb
      .channel(`chambrage-typing-${leagueId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const { userId, name, typing } = payload as { userId: string; name: string; typing: boolean };
        if (userId === viewerId) return;
        const existing = typingTimers.current.get(userId);
        if (existing) clearTimeout(existing);

        if (!typing) {
          typingTimers.current.delete(userId);
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
          });
          return;
        }

        setTypingUsers((prev) => ({ ...prev, [userId]: name }));
        const timer = setTimeout(() => {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
          });
          typingTimers.current.delete(userId);
        }, TYPING_EXPIRY_MS);
        typingTimers.current.set(userId, timer);
      })
      .subscribe();
    typingChannelRef.current = channel;

    const timers = typingTimers.current;
    return () => {
      sb.removeChannel(channel);
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, viewerId]);

  const notifyTyping = useCallback(
    (typing: boolean) => {
      typingChannelRef.current?.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: viewerId, name: viewerName, typing },
      });
    },
    [viewerId, viewerName],
  );

  const handleTyping = useCallback(() => {
    notifyTyping(true);
    if (myTypingTimer.current) clearTimeout(myTypingTimer.current);
    myTypingTimer.current = setTimeout(() => notifyTyping(false), 2500);
  }, [notifyTyping]);

  /* --- Scroll intelligent ----------------------------------------------------- */
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stickToBottomRef.current = nearBottom;
    if (nearBottom && newBelow > 0) {
      setNewBelow(0);
      markRead();
    }
    if (el.scrollTop < 60 && hasMoreOlder && !loadingOlder) {
      void loadOlder();
    }
  }

  async function loadOlder() {
    if (!oldestLoadedAt.current || loadingOlder) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const page = await loadMessagesPage(sb, leagueId, { before: oldestLoadedAt.current });
      if (page.messages.length > 0) {
        oldestLoadedAt.current = page.messages[0].createdAt;
        setMessages((prev) => mergeMessages(prev, page.messages));
        const older = await loadReactionsFor(sb, page.messages.map((m) => m.id));
        setReactions((prev) => mergeReactions(prev, older));
      }
      setHasMoreOlder(page.hasMoreOlder);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  async function jumpTo(messageId: string) {
    let attempts = 0;
    while (!messageRefs.current.has(messageId) && hasMoreOlder && attempts < 20) {
      await loadOlder();
      attempts += 1;
    }
    const el = messageRefs.current.get(messageId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlighted(messageId);
      setTimeout(() => setHighlighted((h) => (h === messageId ? null : h)), 1500);
    }
  }

  /* --- Envoi -------------------------------------------------------------- */
  async function handleSendText(body: string) {
    const tempId = `temp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const optimistic: RawMessage = {
      id: tempId,
      senderId: viewerId,
      messageType: "text",
      body,
      mediaUrl: null,
      replyToId: replyTo?.id ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      pollAllowsMultiple: null,
    };
    setMessages((prev) => mergeMessages(prev, [optimistic]));
    setPendingStatus((p) => ({ ...p, [tempId]: "sending" }));
    setReplyTo(null);
    notifyTyping(false);
    stickToBottomRef.current = true;
    requestAnimationFrame(() => scrollToBottom(true));

    const result = await sendTextMessage({ leagueId, body, replyToId: optimistic.replyToId });
    if (result.ok) {
      setMessages((prev) => mergeMessages(prev.filter((m) => m.id !== tempId), [result.data]));
      setPendingStatus((p) => {
        const next = { ...p };
        delete next[tempId];
        return next;
      });
    } else {
      setPendingStatus((p) => ({ ...p, [tempId]: "error" }));
    }
  }

  async function handleSendImage(file: File, caption: string) {
    const tempId = `temp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const optimistic: RawMessage = {
      id: tempId,
      senderId: viewerId,
      messageType: "image",
      body: caption || null,
      mediaUrl: URL.createObjectURL(file),
      replyToId: replyTo?.id ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      pollAllowsMultiple: null,
    };
    setMessages((prev) => mergeMessages(prev, [optimistic]));
    setPendingStatus((p) => ({ ...p, [tempId]: "sending" }));
    setReplyTo(null);
    stickToBottomRef.current = true;
    requestAnimationFrame(() => scrollToBottom(true));

    const formData = new FormData();
    formData.set("leagueId", leagueId);
    formData.set("file", file);
    if (caption) formData.set("caption", caption);
    if (optimistic.replyToId) formData.set("replyToId", optimistic.replyToId);

    const result = await sendImageMessage(formData);
    if (result.ok) {
      setMessages((prev) => mergeMessages(prev.filter((m) => m.id !== tempId), [result.data]));
      setPendingStatus((p) => {
        const next = { ...p };
        delete next[tempId];
        return next;
      });
    } else {
      setPendingStatus((p) => ({ ...p, [tempId]: "error" }));
    }
  }

  async function handleSendPoll(question: string, options: string[], allowsMultiple: boolean): Promise<boolean> {
    const result = await sendPollMessage({
      leagueId,
      question,
      options,
      allowsMultiple,
      replyToId: replyTo?.id ?? null,
    });
    if (!result.ok) return false;

    setMessages((prev) => mergeMessages(prev, [result.data.message]));
    setPollOptions((prev) => mergePollOptions(prev, result.data.options));
    setReplyTo(null);
    stickToBottomRef.current = true;
    requestAnimationFrame(() => scrollToBottom(true));
    return true;
  }

  async function handleVote(optionId: string, allowsMultiple: boolean) {
    // Optimiste : bascule tout de suite, l'écho temps réel confirmera sans
    // à-coup visible.
    setPollVotes((prev) => {
      const messageId = pollOptions.find((o) => o.id === optionId)?.messageId;
      const alreadyMine = prev.some((v) => v.optionId === optionId && v.userId === viewerId);
      const withoutMine = allowsMultiple
        ? prev.filter((v) => !(v.optionId === optionId && v.userId === viewerId))
        : prev.filter((v) => {
            if (v.userId !== viewerId) return true;
            return pollOptions.find((o) => o.id === v.optionId)?.messageId !== messageId;
          });
      return alreadyMine ? withoutMine : [...withoutMine, { optionId, userId: viewerId }];
    });
    await votePoll({ optionId, allowsMultiple });
  }

  async function handleReact(messageId: string, emoji: string) {
    // Optimiste : bascule tout de suite, la confirmation serveur (et l'écho
    // temps réel) reconfirmera la même chose sans à-coup visible.
    setReactions((prev) => {
      const mine = prev.find((r) => r.messageId === messageId && r.userId === viewerId);
      const withoutMine = prev.filter((r) => !(r.messageId === messageId && r.userId === viewerId));
      if (mine?.emoji === emoji) return withoutMine;
      return [...withoutMine, { messageId, userId: viewerId, emoji }];
    });
    await toggleReaction({ messageId, emoji });
  }

  async function handleEditSubmit(body: string) {
    if (!editing) return;
    const id = editing.id;
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, body, updatedAt: new Date().toISOString() } : m)),
    );
    setEditing(null);
    await editMessage({ messageId: id, body });
  }

  async function handleDelete(messageId: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m)),
    );
    await deleteMessage(messageId);
  }

  /* --- Dérivé pour l'affichage ------------------------------------------------ */
  const messagesById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const unreadDividerId = useMemo(
    () => firstUnreadId(messages, viewerId, initial.lastReadAt),
    // Repéré une seule fois à l'ouverture — pas recalculé à chaque message lu,
    // sinon le séparateur disparaîtrait sous les yeux du joueur en train de lire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function nameFor(userId: string): string {
    return rosterById.get(userId)?.displayName ?? "Un joueur";
  }

  const onlineOthers = onlineIds.filter((id) => id !== viewerId);
  const presenceLabel =
    onlineOthers.length === 0
      ? `${roster.length} membre${roster.length > 1 ? "s" : ""}`
      : onlineOthers.length <= 2
        ? `${onlineOthers.map(nameFor).join(", ")} en ligne`
        : `${onlineOthers.length} en ligne`;

  /**
   * La liste à afficher, entrelacée avec ses séparateurs de journée, chaque
   * message porteur de son rang dans sa « rafale » (première/dernière) pour
   * n'afficher le nom et l'avatar qu'une fois par rafale — comme
   * WhatsApp/Messenger, jamais à chaque message.
   */
  type RenderItem =
    | { kind: "day"; key: string; label: string }
    | { kind: "msg"; key: string; message: RawMessage; showAvatar: boolean; showName: boolean; tight: boolean };
  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    let lastDayKey: string | null = null;
    messages.forEach((m, i) => {
      const dayKey = new Date(m.createdAt).toDateString();
      const newDay = dayKey !== lastDayKey;
      if (newDay) {
        items.push({ kind: "day", key: `day-${dayKey}`, label: daySeparatorLabel(m.createdAt) });
        lastDayKey = dayKey;
      }
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const firstOfBurst = newDay || !prev || !sameBurst(prev, m);
      const lastOfBurst = !next || new Date(next.createdAt).toDateString() !== dayKey || !sameBurst(m, next);
      items.push({
        kind: "msg",
        key: m.id,
        message: m,
        showAvatar: lastOfBurst,
        showName: firstOfBurst,
        tight: !firstOfBurst,
      });
    });
    return items;
  }, [messages]);

  function toVM(message: RawMessage): MessageVM {
    const sender = message.senderId ? (rosterById.get(message.senderId) ?? null) : null;
    const replyToMessage = message.replyToId ? (messagesById.get(message.replyToId) ?? null) : null;
    const replyTo = message.replyToId
      ? {
          id: message.replyToId,
          senderName: replyToMessage?.senderId ? nameFor(replyToMessage.senderId) : "un message",
          preview: !replyToMessage
            ? "…"
            : replyToMessage.deletedAt
              ? "Message supprimé"
              : replyToMessage.messageType === "image"
                ? "📷 Photo"
                : replyToMessage.messageType === "poll"
                  ? `📊 ${replyToMessage.body ?? "Sondage"}`
                  : (replyToMessage.body ?? ""),
        }
      : null;

    const mentionSegments = message.body ? splitMentions(message.body, roster) : [];

    const poll =
      message.messageType === "poll"
        ? (() => {
            const options = pollOptions.filter((o) => o.messageId === message.id);
            const votesForMessage = pollVotes.filter((v) =>
              options.some((o) => o.id === v.optionId),
            );
            return {
              tally: tallyPoll(options, votesForMessage, viewerId),
              allowsMultiple: message.pollAllowsMultiple ?? false,
              totalVoters: new Set(votesForMessage.map((v) => v.userId)).size,
            };
          })()
        : null;

    return {
      message,
      sender,
      isMine: message.senderId === viewerId,
      replyTo,
      reactions: groupReactions(reactions, message.id, viewerId),
      myReactionEmoji: computeMyReaction(reactions, message.id, viewerId),
      readState: computeReadState(message, reads, memberIds),
      readByNames: computeReadBy(message, reads, memberIds).map(nameFor),
      notReadByNames: computeNotReadBy(message, reads, memberIds).map(nameFor),
      mentionSegments,
      mentionsMe: mentionSegments.some((s) => s.mentionUserId === viewerId),
      poll,
      pending: pendingStatus[message.id],
    };
  }

  const typingNames = Object.values(typingUsers);
  const reactionSheetGroups = reactionSheetFor
    ? groupReactions(reactions, reactionSheetFor, viewerId)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-surface-sunk/40"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b border-line bg-surface px-3 py-2.5 shadow-[var(--shadow-card)]">
        <Link
          href={resumeHref}
          aria-label="Retour"
          className="grid size-9 shrink-0 place-items-center rounded-full text-[19px] text-ink-muted active:bg-surface-sunk"
        >
          ‹
        </Link>

        <div className="flex shrink-0 -space-x-2.5">
          {others.slice(0, 3).map((p) => (
            <div key={p.userId} className="rounded-full ring-2 ring-surface">
              <PlayerAvatar player={p} clubs={clubs} size={32} />
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[16px] leading-tight text-ink">{leagueName}</p>
          <p className="truncate text-[12px] text-ink-muted">
            {onlineOthers.length > 0 && <span className="mr-1 text-winner">●</span>}
            {presenceLabel}
          </p>
        </div>

        <Link
          href={pouvoirsHref}
          className="shrink-0 rounded-full border border-line-strong px-2.5 py-1 text-[12px] font-semibold text-ink-muted active:bg-surface-sunk"
        >
          Pouvoirs
        </Link>
      </header>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-3 py-3">
        {loadingOlder && (
          <p className="py-2 text-center text-[11px] text-ink-faint">Chargement…</p>
        )}
        {!hasMoreOlder && messages.length > 0 && (
          <p className="py-2 text-center text-[11px] text-ink-faint">Début de Chambrage 🏉</p>
        )}
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="text-3xl" aria-hidden>💬</span>
            <p className="font-display text-[16px] text-ink">Personne n&apos;a encore parlé</p>
            <p className="max-w-[30ch] text-[13px] text-ink-muted">À toi de lancer les hostilités.</p>
          </div>
        )}

        <div className="flex flex-col">
          {renderItems.map((item) => {
            if (item.kind === "day") {
              return (
                <div key={item.key} className="my-3 flex items-center justify-center">
                  <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-semibold text-ink-muted shadow-[var(--shadow-card)]">
                    {item.label}
                  </span>
                </div>
              );
            }
            const { message } = item;
            return (
              <div key={item.key} className={item.tight ? "mt-0.5" : "mt-2.5"}>
                {message.id === unreadDividerId && (
                  <div className="my-2 flex items-center gap-2">
                    <span className="h-px flex-1 bg-wrong/40" />
                    <span className="rounded-full bg-wrong-soft px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-wrong">
                      Nouveaux messages
                    </span>
                    <span className="h-px flex-1 bg-wrong/40" />
                  </div>
                )}
                <div
                  ref={(el) => {
                    if (el) messageRefs.current.set(message.id, el);
                    else messageRefs.current.delete(message.id);
                  }}
                  className={
                    highlighted === message.id ? "rounded-[20px] bg-clay-soft/60 transition-colors" : undefined
                  }
                >
                  <MessageBubble
                    vm={toVM(message)}
                    clubs={clubs}
                    quickEmojis={reactionChoices}
                    showAvatar={item.showAvatar}
                    showName={item.showName}
                    onReply={() => setReplyTo(message)}
                    onReact={(emoji) => handleReact(message.id, emoji)}
                    onEdit={() => setEditing(message)}
                    onDelete={() => handleDelete(message.id)}
                    onJumpTo={jumpTo}
                    onOpenReactionDetail={() => setReactionSheetFor(message.id)}
                    onVote={(optionId) => handleVote(optionId, message.pollAllowsMultiple ?? false)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {typingNames.length > 0 && (
        <p className="flex items-center gap-1.5 px-4 py-1 text-[12px] text-ink-muted">
          {typingNames.join(", ")} {typingNames.length > 1 ? "écrivent" : "écrit"}
          <span className="inline-flex gap-0.5" aria-hidden>
            <span className="size-1 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.2s]" />
            <span className="size-1 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.1s]" />
            <span className="size-1 animate-bounce rounded-full bg-ink-faint" />
          </span>
        </p>
      )}

      {newBelow > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              setNewBelow(0);
              stickToBottomRef.current = true;
              scrollToBottom(true);
              markRead();
            }}
            className="mb-1.5 rounded-full bg-clay px-3.5 py-1.5 text-[12px] font-bold text-surface shadow-[var(--shadow-card)]"
          >
            ↓ {newBelow} nouveau{newBelow > 1 ? "x" : ""} message{newBelow > 1 ? "s" : ""}
          </button>
        </div>
      )}

      {editing ? (
        <EditBar
          initialBody={editing.body ?? ""}
          onCancel={() => setEditing(null)}
          onSubmit={handleEditSubmit}
        />
      ) : (
        <Composer
          replyTo={replyTo ? toVM(replyTo) : null}
          onCancelReply={() => setReplyTo(null)}
          onSendText={handleSendText}
          onSendImage={handleSendImage}
          onSendPoll={handleSendPoll}
          onTyping={handleTyping}
          roster={others}
        />
      )}

      {reactionSheetFor && (
        <ReactionDetailSheet
          groups={reactionSheetGroups}
          nameFor={nameFor}
          onClose={() => setReactionSheetFor(null)}
        />
      )}
    </div>
  );
}

function mergeReactions(existing: RawReaction[], incoming: RawReaction[]): RawReaction[] {
  const key = (r: RawReaction) => `${r.messageId}:${r.userId}`;
  const byKey = new Map(existing.map((r) => [key(r), r]));
  for (const r of incoming) byKey.set(key(r), r);
  return [...byKey.values()];
}

function mergePollOptions(existing: RawPollOption[], incoming: RawPollOption[]): RawPollOption[] {
  const byId = new Map(existing.map((o) => [o.id, o]));
  for (const o of incoming) byId.set(o.id, o);
  return [...byId.values()];
}

function EditBar({
  initialBody,
  onCancel,
  onSubmit,
}: {
  initialBody: string;
  onCancel: () => void;
  onSubmit: (body: string) => void;
}) {
  const [value, setValue] = useState(initialBody);
  return (
    <div
      className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2.5"
      style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        className="flex-1 rounded-full border border-line bg-surface-sunk px-3.5 py-2 text-[14.5px] text-ink outline-none"
      />
      <button
        type="button"
        onClick={onCancel}
        className="rounded-full border border-line-strong px-3 py-1.5 text-[13px] font-semibold text-ink-muted"
      >
        Annuler
      </button>
      <button
        type="button"
        onClick={() => value.trim() && onSubmit(value.trim())}
        className="rounded-full bg-clay px-3.5 py-1.5 text-[13px] font-bold text-surface"
      >
        OK
      </button>
    </div>
  );
}
