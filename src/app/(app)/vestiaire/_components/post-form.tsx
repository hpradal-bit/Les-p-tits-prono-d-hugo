"use client";

import { useActionState, useRef, useEffect } from "react";
import { Button } from "@/components/ui";
import { publishPost } from "@/lib/feed/actions";
import { IDLE } from "@/lib/auth/action-state";

export function PostForm() {
  const [state, action, pending] = useActionState(publishPost, IDLE);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      <textarea
        name="body"
        rows={2}
        required
        maxLength={500}
        placeholder="Balance ton chambrage…"
        className="w-full resize-none rounded-[var(--radius-card)] border border-line bg-surface px-3.5 py-3 text-[15px] text-ink placeholder:text-ink-faint focus-visible:border-clay"
      />
      <div className="flex items-center justify-between gap-3">
        <p
          className={`text-[13px] ${state.status === "error" ? "text-wrong" : "text-ink-faint"}`}
          role={state.status === "error" ? "alert" : undefined}
        >
          {state.status === "error" ? state.message : ""}
        </p>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Envoi…" : "Publier"}
        </Button>
      </div>
    </form>
  );
}
