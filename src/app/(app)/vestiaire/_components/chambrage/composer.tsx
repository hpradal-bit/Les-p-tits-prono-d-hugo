"use client";

/**
 * Le champ de saisie : texte, emoji, photo — moderne, avec la bannière de
 * réponse au-dessus quand on cite un message (§2.4, §2.5, §2.9), et
 * l'autocomplétion « @Untel » pour interpeller un joueur en particulier.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { searchGifsAction } from "@/lib/chambrage/actions";
import type { MentionCandidate } from "@/lib/chambrage/model";
import type { GifResult } from "@/lib/chambrage/gif-provider";
import type { MessageVM } from "./types";

const GIF_SEARCH_DEBOUNCE_MS = 400;

const EMOJI_PALETTE = [
  "😀", "😂", "😍", "😎", "🤔", "😢", "😡", "😱",
  "👍", "👎", "🙏", "👏", "💪", "🤝", "🔥", "💯",
  "🏉", "🏆", "⚡", "🎯", "😴", "🤡", "👀", "❤️",
];

interface PollDraft {
  question: string;
  options: string[];
  allowsMultiple: boolean;
  sending: boolean;
  error: string | null;
}

const EMPTY_POLL_DRAFT: PollDraft = {
  question: "",
  options: ["", ""],
  allowsMultiple: false,
  sending: false,
  error: null,
};

export function Composer({
  replyTo,
  onCancelReply,
  onSendText,
  onSendImage,
  onSendPoll,
  onSendGif,
  onTyping,
  roster,
  disabled,
}: {
  replyTo: MessageVM | null;
  onCancelReply: () => void;
  onSendText: (body: string) => void;
  onSendImage: (file: File, caption: string) => void;
  /** Renvoie `true` si le sondage a bien été envoyé. */
  onSendPoll: (question: string, options: string[], allowsMultiple: boolean) => Promise<boolean>;
  onSendGif: (gifUrl: string) => void;
  onTyping: () => void;
  /** Pour l'autocomplétion « @Untel ». */
  roster: readonly MentionCandidate[];
  disabled?: boolean;
}) {
  const [body, setBody] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [pollDraft, setPollDraft] = useState<PollDraft | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState<GifResult[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState<string | null>(null);
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

  function updatePollOption(index: number, value: string) {
    setPollDraft((d) => (d ? { ...d, options: d.options.map((o, i) => (i === index ? value : o)) } : d));
  }

  function addPollOption() {
    setPollDraft((d) => (d && d.options.length < 10 ? { ...d, options: [...d.options, ""] } : d));
  }

  function removePollOption(index: number) {
    setPollDraft((d) => (d && d.options.length > 2 ? { ...d, options: d.options.filter((_, i) => i !== index) } : d));
  }

  async function submitPoll() {
    if (!pollDraft) return;
    const question = pollDraft.question.trim();
    const options = pollDraft.options.map((o) => o.trim()).filter((o) => o.length > 0);
    if (!question) {
      setPollDraft({ ...pollDraft, error: "La question ne peut pas être vide." });
      return;
    }
    if (options.length < 2) {
      setPollDraft({ ...pollDraft, error: "Il faut au moins deux réponses." });
      return;
    }
    setPollDraft({ ...pollDraft, sending: true, error: null });
    const success = await onSendPoll(question, options, pollDraft.allowsMultiple);
    if (success) {
      setPollDraft(null);
    } else {
      setPollDraft({ ...pollDraft, sending: false, error: "L'envoi a échoué. Réessaie dans un instant." });
    }
  }

  // Recherche différée : on attend une pause dans la frappe avant d'interroger
  // Tenor, pour ne pas lancer une requête à chaque lettre tapée. Le tout
  // passe par un minuteur, y compris la remise à zéro d'une recherche vidée —
  // un `setState` synchrone au corps de l'effet enchaînerait un second rendu.
  useEffect(() => {
    if (!gifPickerOpen) return;
    if (gifQuery.trim().length === 0) {
      const timer = setTimeout(() => {
        setGifResults([]);
        setGifError(null);
        setGifLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    const loadingTimer = setTimeout(() => setGifLoading(true), 0);
    const timer = setTimeout(async () => {
      const result = await searchGifsAction(gifQuery);
      if (result.ok) {
        setGifResults(result.data);
        setGifError(result.data.length === 0 ? "Aucun résultat." : null);
      } else {
        setGifResults([]);
        setGifError(result.error);
      }
      setGifLoading(false);
    }, GIF_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(loadingTimer);
      clearTimeout(timer);
    };
  }, [gifPickerOpen, gifQuery]);

  function pickGif(gif: GifResult) {
    onSendGif(gif.url);
    setGifPickerOpen(false);
    setGifQuery("");
    setGifResults([]);
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
        <button
          type="button"
          onClick={() => setPollDraft(EMPTY_POLL_DRAFT)}
          className="grid size-9 shrink-0 place-items-center rounded-full text-[19px] text-ink-muted"
          aria-label="Créer un sondage"
        >
          📊
        </button>
        <button
          type="button"
          onClick={() => setGifPickerOpen(true)}
          className="grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-black text-ink-muted"
          aria-label="Envoyer un GIF"
        >
          GIF
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

      {pollDraft && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/30 backdrop-blur-[1px]"
          onClick={() => !pollDraft.sending && setPollDraft(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-[24px] bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-card)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-[18px] text-ink">Créer un sondage</h2>
              <button
                type="button"
                onClick={() => setPollDraft(null)}
                disabled={pollDraft.sending}
                className="grid size-8 place-items-center rounded-full bg-surface-sunk text-ink-muted"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <input
              value={pollDraft.question}
              onChange={(e) => setPollDraft({ ...pollDraft, question: e.target.value })}
              placeholder="Poser une question…"
              autoFocus
              className="w-full rounded-[14px] border border-line bg-surface-sunk px-3.5 py-2.5 text-[14.5px] text-ink outline-none"
            />

            <div className="flex flex-col gap-2">
              {pollDraft.options.map((option, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={option}
                    onChange={(e) => updatePollOption(i, e.target.value)}
                    placeholder={`Réponse ${i + 1}`}
                    maxLength={80}
                    className="w-full flex-1 rounded-[14px] border border-line bg-surface-sunk px-3.5 py-2 text-[14px] text-ink outline-none"
                  />
                  {pollDraft.options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removePollOption(i)}
                      className="grid size-8 shrink-0 place-items-center rounded-full text-ink-faint"
                      aria-label="Retirer cette réponse"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {pollDraft.options.length < 10 && (
                <button
                  type="button"
                  onClick={addPollOption}
                  className="self-start text-[13.5px] font-semibold text-clay"
                >
                  + Ajouter une réponse
                </button>
              )}
            </div>

            <label className="flex items-center gap-2 text-[13.5px] text-ink">
              <input
                type="checkbox"
                checked={pollDraft.allowsMultiple}
                onChange={(e) => setPollDraft({ ...pollDraft, allowsMultiple: e.target.checked })}
                className="size-4"
              />
              Autoriser plusieurs réponses
            </label>

            {pollDraft.error && <p className="text-[13px] font-semibold text-wrong">{pollDraft.error}</p>}

            <button
              type="button"
              onClick={submitPoll}
              disabled={pollDraft.sending}
              className="rounded-full bg-clay py-2.5 text-center text-[14px] font-bold text-surface disabled:opacity-60"
            >
              {pollDraft.sending ? "Envoi…" : "Créer le sondage"}
            </button>
          </div>
        </div>
      )}

      {gifPickerOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/30 backdrop-blur-[1px]"
          onClick={() => setGifPickerOpen(false)}
        >
          <div
            className="flex h-[70vh] w-full max-w-md flex-col gap-3 rounded-t-[24px] bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-card)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <input
                value={gifQuery}
                onChange={(e) => setGifQuery(e.target.value)}
                placeholder="Chercher un GIF…"
                autoFocus
                className="w-full flex-1 rounded-full border border-line bg-surface-sunk px-3.5 py-2 text-[14.5px] text-ink outline-none"
              />
              <button
                type="button"
                onClick={() => setGifPickerOpen(false)}
                className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunk text-ink-muted"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {gifLoading && <p className="py-4 text-center text-[13px] text-ink-muted">Recherche…</p>}
              {!gifLoading && gifError && (
                <p className="py-4 text-center text-[13px] text-ink-muted">{gifError}</p>
              )}
              {!gifLoading && !gifError && gifResults.length === 0 && gifQuery.trim().length === 0 && (
                <p className="py-4 text-center text-[13px] text-ink-muted">Tape un mot pour chercher un GIF.</p>
              )}
              {gifResults.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {gifResults.map((gif) => (
                    <button key={gif.id} type="button" onClick={() => pickGif(gif)} className="overflow-hidden rounded-[14px]">
                      {/* Prévisualisation d'un GIF hébergé par Tenor : <img> nature. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={gif.previewUrl}
                        alt={gif.description}
                        className="h-28 w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <p className="text-center text-[10.5px] text-ink-faint">Propulsé par Tenor</p>
          </div>
        </div>
      )}
    </div>
  );
}
