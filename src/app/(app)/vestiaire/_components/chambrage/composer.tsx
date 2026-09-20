"use client";

/**
 * Le champ de saisie : texte, emoji, photo — moderne, avec la bannière de
 * réponse au-dessus quand on cite un message (§2.4, §2.5, §2.9), et
 * l'autocomplétion « @Untel » pour interpeller un joueur en particulier.
 */

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { MentionCandidate } from "@/lib/chambrage/model";
import type { MessageVM } from "./types";

const EMOJI_PALETTE = [
  "😀", "😂", "😍", "😎", "🤔", "😢", "😡", "😱",
  "👍", "👎", "🙏", "👏", "💪", "🤝", "🔥", "💯",
  "🏉", "🏆", "⚡", "🎯", "😴", "🤡", "👀", "❤️",
];

export function Composer({
  replyTo,
  onCancelReply,
  onSendText,
  onSendImage,
  onTyping,
  roster,
  disabled,
}: {
  replyTo: MessageVM | null;
  onCancelReply: () => void;
  onSendText: (body: string) => void;
  onSendImage: (file: File, caption: string) => void;
  onTyping: () => void;
  /** Pour l'autocomplétion « @Untel ». */
  roster: readonly MentionCandidate[];
  disabled?: boolean;
}) {
  const [body, setBody] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string; caption: string } | null>(
    null,
  );
  // Position du « @ » qui ouvre l'autocomplétion en cours, et ce qui a été
  // tapé après — `null` quand aucune mention n'est en train de s'écrire.
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSendText = body.trim().length > 0;
  const suggestions =
    mentionStart === null
      ? []
      : roster
          .filter((p) => p.displayName.toLowerCase().startsWith(mentionQuery.toLowerCase()))
          .slice(0, 5);

  function submitText() {
    if (!canSendText) return;
    onSendText(body.trim());
    setBody("");
    setShowEmoji(false);
    setMentionStart(null);
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setBody(value);
    onTyping();

    const caret = e.target.selectionStart ?? value.length;
    // Un « @ » actif : précédé d'un début de ligne ou d'une espace, suivi
    // d'aucune espace jusqu'au curseur.
    const match = /(?:^|\s)@([\p{L}\p{N}]*)$/u.exec(value.slice(0, caret));
    if (match) {
      setMentionStart(caret - match[1].length - 1);
      setMentionQuery(match[1]);
      setActiveSuggestion(0);
    } else {
      setMentionStart(null);
    }
  }

  function selectMention(candidate: MentionCandidate) {
    if (mentionStart === null) return;
    const before = body.slice(0, mentionStart);
    const after = body.slice(mentionStart + 1 + mentionQuery.length);
    const next = `${before}@${candidate.displayName} ${after}`;
    setBody(next);
    setMentionStart(null);
    const caret = before.length + candidate.displayName.length + 2;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(caret, caret);
    });
  }

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setPendingImage({ file, previewUrl, caption: "" });
  }

  function sendPendingImage() {
    if (!pendingImage) return;
    onSendImage(pendingImage.file, pendingImage.caption.trim());
    URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
  }

  function cancelPendingImage() {
    if (!pendingImage) return;
    URL.revokeObjectURL(pendingImage.previewUrl);
    setPendingImage(null);
  }

  if (pendingImage) {
    return (
      <div
        className="flex flex-col gap-2.5 border-t border-line bg-surface p-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-start gap-2.5">
          {/* Prévisualisation locale (URL objet du fichier choisi), pas encore envoyée. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pendingImage.previewUrl}
            alt="Prévisualisation"
            className="size-20 shrink-0 rounded-[14px] object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <input
              value={pendingImage.caption}
              onChange={(e) => setPendingImage({ ...pendingImage, caption: e.target.value })}
              placeholder="Ajouter un texte (optionnel)…"
              className="w-full rounded-full border border-line bg-surface-sunk px-3.5 py-2 text-[14px] text-ink outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelPendingImage}
                className="rounded-full border border-line-strong px-3.5 py-1.5 text-[13px] font-semibold text-ink-muted"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={sendPendingImage}
                className="rounded-full bg-clay px-4 py-1.5 text-[13px] font-bold text-surface"
              >
                Envoyer
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col border-t border-line bg-surface"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {replyTo && (
        <div className="flex items-center gap-2 border-b border-line bg-surface-sunk px-3.5 py-2">
          <div className="min-w-0 flex-1 border-l-[3px] border-clay pl-2">
            <p className="text-[11.5px] font-semibold text-clay">
              Répondre à {replyTo.sender?.displayName ?? "un joueur"}
            </p>
            <p className="truncate text-[12.5px] text-ink-muted">
              {replyTo.message.deletedAt
                ? "Message supprimé"
                : replyTo.message.messageType === "image"
                  ? "📷 Photo"
                  : replyTo.message.body}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="grid size-7 shrink-0 place-items-center rounded-full text-ink-faint"
            aria-label="Annuler la réponse"
          >
            ✕
          </button>
        </div>
      )}

      {showEmoji && (
        <div className="grid grid-cols-8 gap-1 border-b border-line p-2.5">
          {EMOJI_PALETTE.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setBody((b) => b + emoji);
                textareaRef.current?.focus();
              }}
              className="grid size-9 place-items-center rounded-full text-[19px] active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <ul className="flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2">
          {suggestions.map((p, i) => (
            <li key={p.userId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectMention(p)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold",
                  i === activeSuggestion ? "bg-clay text-surface" : "bg-surface-sunk text-ink",
                )}
              >
                @{p.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2 px-3 py-2.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={pickImage}
        />
        <button
          type="button"
          onClick={() => setShowEmoji((v) => !v)}
          className="grid size-9 shrink-0 place-items-center rounded-full text-[19px] text-ink-muted"
          aria-label="Emoji"
        >
          😊
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="grid size-9 shrink-0 place-items-center rounded-full text-[19px] text-ink-muted"
          aria-label="Envoyer une photo"
        >
          📷
        </button>

        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleBodyChange}
          onKeyDown={(e) => {
            if (suggestions.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveSuggestion((i) => (i + 1) % suggestions.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveSuggestion((i) => (i - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                selectMention(suggestions[activeSuggestion]);
                return;
              }
              if (e.key === "Escape") {
                setMentionStart(null);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submitText();
            }
          }}
          placeholder="Écrire un message…"
          rows={1}
          disabled={disabled}
          className="max-h-28 min-h-[38px] flex-1 resize-none rounded-[20px] border border-line bg-surface-sunk px-3.5 py-2 text-[14.5px] text-ink outline-none"
        />

        <button
          type="button"
          onClick={submitText}
          disabled={!canSendText || disabled}
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-full text-[16px] font-bold transition",
            canSendText && !disabled ? "bg-clay text-surface" : "bg-surface-sunk text-ink-faint",
          )}
          aria-label="Envoyer"
        >
          ➤
        </button>
      </div>
    </div>
  );
}
