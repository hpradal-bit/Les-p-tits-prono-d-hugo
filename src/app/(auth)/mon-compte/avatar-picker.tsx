"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { updateAvatar } from "@/lib/auth/actions";
import { IDLE } from "@/lib/auth/action-state";
import type { ClubAvatar } from "@/lib/auth/avatars";
import { cn } from "@/lib/cn";
import { Alert, SubmitButton } from "../_components/form";

type Tab = "emoji" | "club" | "photo";

const TABS: { id: Tab; label: string }[] = [
  { id: "emoji", label: "Emoji" },
  { id: "club", label: "Mon club" },
  { id: "photo", label: "Photo" },
];

/**
 * Choix de l'avatar : emoji de la palette, logo d'un club du Top 14, ou photo.
 *
 * Les trois onglets partagent la même action serveur — et donc le même état de
 * retour. Les vérifications faites ici (taille, type) ne sont qu'un confort :
 * l'action serveur les refait toutes, et va plus loin en reniflant les octets.
 */
export function AvatarPicker({
  emojis,
  clubs,
  currentKind,
  currentValue,
  maxBytes,
  allowedMime,
}: {
  emojis: string[];
  clubs: ClubAvatar[];
  currentKind: string;
  currentValue: string;
  maxBytes: number;
  allowedMime: string[];
}) {
  const [state, action] = useActionState(updateAvatar, IDLE);
  const [tab, setTab] = useState<Tab>(
    TABS.some((t) => t.id === currentKind) ? (currentKind as Tab) : "emoji",
  );
  const [fileNote, setFileNote] = useState<string | null>(null);

  const megabytes = (maxBytes / (1024 * 1024)).toFixed(
    maxBytes % (1024 * 1024) === 0 ? 0 : 1,
  );

  function checkFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return setFileNote(null);
    if (file.size > maxBytes) return setFileNote(`Trop lourde : ${megabytes} Mo maximum.`);
    if (!allowedMime.includes(file.type)) return setFileNote("Format non accepté.");
    setFileNote(file.name);
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Type d'avatar" className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition",
              tab === t.id
                ? "bg-clay text-white"
                : "border border-line bg-surface text-ink-muted hover:bg-surface-sunk",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Alert state={state} />

      {tab === "emoji" && (
        <form action={action}>
          <input type="hidden" name="kind" value="emoji" />
          <div className="grid grid-cols-6 gap-2">
            {emojis.map((emoji) => {
              const active = currentKind === "emoji" && currentValue === emoji;
              return (
                <button
                  key={emoji}
                  type="submit"
                  name="value"
                  value={emoji}
                  aria-label={`Choisir l'emoji ${emoji}`}
                  aria-pressed={active}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-xl border text-2xl transition",
                    active
                      ? "border-clay bg-clay-soft"
                      : "border-line bg-surface hover:bg-surface-sunk",
                  )}
                >
                  <span aria-hidden>{emoji}</span>
                </button>
              );
            })}
          </div>
        </form>
      )}

      {tab === "club" && (
        <form action={action}>
          <input type="hidden" name="kind" value="club" />
          <div className="grid grid-cols-4 gap-2">
            {clubs.map((club) => {
              const active = currentKind === "club" && currentValue === club.code;
              return (
                <button
                  key={club.code}
                  type="submit"
                  name="value"
                  value={club.code}
                  title={club.name}
                  aria-label={`Choisir le logo de ${club.name}`}
                  aria-pressed={active}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-xl border p-2 transition",
                    active
                      ? "border-clay bg-clay-soft"
                      : "border-line bg-surface hover:bg-surface-sunk",
                  )}
                >
                  <Image
                    src={club.logoUrl}
                    alt=""
                    width={44}
                    height={44}
                    className="size-full object-contain"
                  />
                </button>
              );
            })}
          </div>
        </form>
      )}

      {tab === "photo" && (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="kind" value="photo" />
          <input
            type="file"
            name="file"
            required
            accept={allowedMime.join(",")}
            onChange={checkFile}
            className={cn(
              "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[14px] text-ink-muted",
              "file:mr-3 file:rounded-full file:border-0 file:bg-surface-sunk",
              "file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-ink",
            )}
          />
          <p className="text-[13px] text-ink-faint">
            {fileNote ??
              `${megabytes} Mo maximum · ${allowedMime
                .map((m) => m.replace("image/", "").toUpperCase())
                .join(", ")}`}
          </p>
          {state.fieldErrors?.file?.length ? (
            <p className="text-[13px] font-medium text-wrong">{state.fieldErrors.file[0]}</p>
          ) : null}
          <SubmitButton className="self-start" size="sm" pendingLabel="Envoi…">
            Téléverser
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
