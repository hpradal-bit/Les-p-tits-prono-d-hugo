"use client";

/**
 * Une bulle de message : la mienne à droite, celle d'un autre à gauche, avec
 * son avatar, l'heure, l'aperçu de réponse cité, les réactions, et le statut
 * lu pour mes propres messages. L'appui long ouvre le menu d'actions (§2.10) ;
 * sur ses propres messages, glisser vers la gauche révèle qui l'a lu, comme
 * iMessage.
 */

import { useEffect, useState } from "react";
import { PlayerAvatar } from "../../../_components/player-avatar";
import { cn } from "@/lib/cn";
import type { ClubAvatar } from "@/lib/auth/avatars";
import { useMessageGestures } from "./use-message-gestures";
import type { MessageVM } from "./types";

const QUICK_EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "😡", "🔥"];

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function ReadTicks({ state }: { state: MessageVM["readState"] }) {
  if (state === "sent") {
    return (
      <span className="text-ink-faint" aria-label="Envoyé" title="Envoyé">
        ✓
      </span>
    );
  }
  return (
    <span
      className={cn(state === "read" ? "text-clay" : "text-ink-faint")}
      aria-label={state === "read" ? "Lu" : "Distribué"}
      title={state === "read" ? "Lu" : "Distribué"}
    >
      ✓✓
    </span>
  );
}

export function MessageBubble({
  vm,
  clubs,
  quickEmojis = QUICK_EMOJIS,
  showAvatar = true,
  showName = true,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onJumpTo,
  onOpenReactionDetail,
}: {
  vm: MessageVM;
  clubs: readonly ClubAvatar[];
  quickEmojis?: string[];
  /** Dernier message d'une rafale (même expéditeur, peu d'écart) : c'est là que l'avatar s'affiche, comme WhatsApp/Messenger. */
  showAvatar?: boolean;
  /** Premier message d'une rafale : c'est là que le nom s'affiche. */
  showName?: boolean;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onJumpTo: (messageId: string) => void;
  onOpenReactionDetail: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const [showReadBy, setShowReadBy] = useState(false);
  const { message, isMine, sender, replyTo, reactions } = vm;
  const deleted = message.deletedAt !== null;

  const { dragX, handlers: swipeHandlers } = useMessageGestures({
    onLongPress: () => !deleted && setMenuOpen(true),
    onSwipeReply: () => !deleted && onReply(),
    // Glisser vers la gauche sur SON PROPRE message révèle qui l'a lu, comme
    // iMessage — un geste qui n'a pas de sens sur le message d'un autre.
    onSwipeLeft: isMine && !deleted ? () => setShowReadBy(true) : undefined,
    onDoubleTap: () => {
      if (deleted) return;
      onReact("❤️");
      setHeartBurst(true);
    },
  });

  useEffect(() => {
    if (!heartBurst) return;
    const t = setTimeout(() => setHeartBurst(false), 700);
    return () => clearTimeout(t);
  }, [heartBurst]);

  const canEdit = isMine && !deleted && message.messageType === "text";
  const canDelete = isMine && !deleted;

  async function copyText() {
    try {
      await navigator.clipboard.writeText(message.body ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Presse-papiers indisponible (permission refusée, contexte non sécurisé) :
      // tant pis, ce n'est qu'un confort.
    }
    setMenuOpen(false);
  }

  return (
    <div
      className={cn("relative flex gap-2 touch-pan-y", isMine ? "flex-row-reverse" : "flex-row")}
      style={{ transform: dragX !== 0 ? `translateX(${dragX}px)` : undefined }}
    >
      {dragX > 0 && (
        <span
          aria-hidden
          className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-1.5 text-[17px] text-ink-faint"
          style={{ opacity: Math.min(1, dragX / 40) }}
        >
          ↩️
        </span>
      )}

      {dragX < 0 && (
        <span
          aria-hidden
          className="absolute top-1/2 right-0 translate-x-full -translate-y-1/2 pl-1.5 text-[15px] text-ink-faint"
          style={{ opacity: Math.min(1, -dragX / 40) }}
        >
          👁️
        </span>
      )}

      {!isMine && (
        <div className="w-[30px] shrink-0 self-end">
          {showAvatar &&
            (sender ? (
              <PlayerAvatar player={sender} clubs={clubs} size={30} />
            ) : (
              <span className="grid size-[30px] place-items-center rounded-full bg-surface-sunk text-[13px]">
                🏉
              </span>
            ))}
        </div>
      )}

      <div className={cn("flex max-w-[78%] min-w-0 flex-col gap-1", isMine ? "items-end" : "items-start")}>
        {!isMine && showName && (
          <span className="px-1 text-[11.5px] font-semibold text-ink-muted">
            {sender?.displayName ?? "Un joueur"}
          </span>
        )}

        <div
          {...swipeHandlers}
          className={cn(
            "relative min-w-0 select-none rounded-[20px] px-3.5 py-2.5 text-[14.5px] leading-snug shadow-[var(--shadow-card)]",
            isMine ? "rounded-tr-[4px] bg-clay text-surface" : "rounded-tl-[4px] bg-surface text-ink",
            vm.pending === "sending" && "opacity-60",
            vm.pending === "error" && "border border-wrong",
          )}
        >
          {heartBurst && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 grid animate-[chambrage-heart_0.7s_ease-out] place-items-center text-[42px]"
            >
              ❤️
            </span>
          )}
          {deleted ? (
            <p className={cn("italic", isMine ? "text-surface/70" : "text-ink-faint")}>
              Message supprimé
            </p>
          ) : (
            <>
              {replyTo && (
                <button
                  type="button"
                  onClick={() => onJumpTo(replyTo.id)}
                  className={cn(
                    "mb-1.5 block w-full rounded-[10px] border-l-[3px] px-2 py-1 text-left text-[12.5px]",
                    isMine
                      ? "border-surface/50 bg-surface/15 text-surface/90"
                      : "border-clay/50 bg-surface-sunk text-ink-muted",
                  )}
                >
                  <span className="block font-semibold">{replyTo.senderName}</span>
                  <span className="block truncate opacity-90">{replyTo.preview}</span>
                </button>
              )}

              {message.messageType === "image" && message.mediaUrl && (
                // Photo hébergée sur Supabase Storage (domaine non déclaré dans
                // next.config) : <img> nature, pas next/image.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={message.mediaUrl}
                  alt="Photo partagée dans Chambrage"
                  className="mb-1.5 max-h-[280px] w-full rounded-[14px] object-cover"
                  loading="lazy"
                />
              )}

              {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}

              {message.updatedAt !== message.createdAt && (
                <span className={cn("mt-0.5 block text-[10px]", isMine ? "text-surface/60" : "text-ink-faint")}>
                  modifié
                </span>
              )}
            </>
          )}

          <div
            className={cn(
              "mt-1 flex items-center gap-1 text-[10px]",
              isMine ? "justify-end text-surface/70" : "justify-end text-ink-faint",
            )}
          >
            <span>{timeLabel(message.createdAt)}</span>
            {isMine && !deleted && vm.pending !== "error" && <ReadTicks state={vm.readState} />}
            {vm.pending === "sending" && <span aria-hidden>⏳</span>}
          </div>
        </div>

        {vm.pending === "error" && (
          <span className="px-1 text-[11px] font-semibold text-wrong">⚠️ Échec de l&apos;envoi</span>
        )}

        {reactions.length > 0 && (
          <button
            type="button"
            onClick={onOpenReactionDetail}
            className="flex flex-wrap gap-1 rounded-full bg-surface px-1.5 py-1 shadow-[var(--shadow-card)]"
          >
            {reactions.map((r) => (
              <span
                key={r.emoji}
                className={cn(
                  "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px]",
                  r.mine ? "bg-clay-soft text-clay" : "bg-surface-sunk text-ink-muted",
                )}
              >
                {r.emoji} {r.count}
              </span>
            ))}
          </button>
        )}
      </div>

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 backdrop-blur-[1px]"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="mb-0 flex w-full max-w-md flex-col gap-1 rounded-t-[24px] bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-card)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center gap-2 border-b border-line px-2 pb-3 pt-1">
              {quickEmojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onReact(emoji);
                    setMenuOpen(false);
                  }}
                  className="grid size-10 place-items-center rounded-full text-[22px] transition active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <MenuAction
              icon="↩️"
              label="Répondre"
              onClick={() => {
                onReply();
                setMenuOpen(false);
              }}
            />
            {message.messageType === "text" && (
              <MenuAction icon="📋" label={copied ? "Copié !" : "Copier"} onClick={copyText} />
            )}
            {canEdit && (
              <MenuAction
                icon="✏️"
                label="Modifier"
                onClick={() => {
                  onEdit();
                  setMenuOpen(false);
                }}
              />
            )}
            {canDelete && (
              <MenuAction
                icon="🗑️"
                label="Supprimer"
                danger
                onClick={() => {
                  onDelete();
                  setMenuOpen(false);
                }}
              />
            )}
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="mt-1 rounded-[14px] py-3 text-center text-[14px] font-semibold text-ink-muted"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {showReadBy && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 backdrop-blur-[1px]"
          onClick={() => setShowReadBy(false)}
        >
          <div
            className="mb-0 flex w-full max-w-md flex-col gap-2 rounded-t-[24px] bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-card)]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display text-[15px] text-ink">
              {vm.readState === "sent" ? "Envoyé" : "Lu par"}
            </p>
            {vm.readByNames.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {vm.readByNames.map((name) => (
                  <li key={name} className="text-[14px] text-ink">
                    {name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13.5px] text-ink-muted">Personne n&apos;a encore lu ce message.</p>
            )}
            <button
              type="button"
              onClick={() => setShowReadBy(false)}
              className="mt-1 rounded-[14px] py-3 text-center text-[14px] font-semibold text-ink-muted"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuAction({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-[14px] px-3 py-3 text-left text-[15px] font-medium transition active:bg-surface-sunk",
        danger ? "text-wrong" : "text-ink",
      )}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );
}
