"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { sendAnnouncement } from "@/lib/admin/actions";
import { ADMIN_IDLE } from "@/lib/admin/types";

const field =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint";

const TITLE_MAX = 80;
const BODY_MAX = 300;

/**
 * Le message écrit à la main.
 *
 * Le compteur de caractères n'est pas décoratif : une notification tronquée par
 * le téléphone est une notification qu'on ne comprend pas. Les limites sont les
 * mêmes qu'au serveur, qui reste seul juge (règle n° 7).
 */
export function AnnouncementForm({ recipients }: { recipients: number }) {
  const [state, action, pending] = useActionState(sendAnnouncement, ADMIN_IDLE);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="title" className="text-[13px] font-semibold text-ink">
            Titre
          </label>
          <span className="font-mono text-[11px] text-ink-faint">
            {title.length}/{TITLE_MAX}
          </span>
        </div>
        <input
          id="title"
          name="title"
          required
          maxLength={TITLE_MAX}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex. : Match de dimanche reporté"
          className={field}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="body" className="text-[13px] font-semibold text-ink">
            Message
          </label>
          <span className="font-mono text-[11px] text-ink-faint">
            {body.length}/{BODY_MAX}
          </span>
        </div>
        <textarea
          id="body"
          name="body"
          required
          rows={3}
          maxLength={BODY_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Ex. : Toulouse–Bordeaux passe à 21 h. Les pronos restent ouverts jusqu'à 20 h 30."
          className={`${field} leading-relaxed`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="url" className="text-[13px] font-semibold text-ink">
          Où mène le message <span className="font-normal text-ink-faint">(facultatif)</span>
        </label>
        <input id="url" name="url" placeholder="/journee" className={`${field} font-mono text-[13px]`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Envoi…" : `Envoyer aux ${recipients} joueurs`}
        </Button>
        <span className="text-[12px] text-ink-faint">
          Les heures de silence sont respectées.
        </span>
      </div>

      {state.status !== "idle" && state.message && (
        <div
          role="status"
          className={`flex flex-col gap-1 rounded-lg px-3 py-2 text-[13.5px] ${
            state.status === "success" ? "bg-winner-soft text-winner" : "bg-wrong-soft text-wrong"
          }`}
        >
          <span>{state.message}</span>
          {state.details?.map((d) => (
            <span key={d} className="text-[12.5px] leading-snug opacity-80">
              {d}
            </span>
          ))}
        </div>
      )}
    </form>
  );
}
