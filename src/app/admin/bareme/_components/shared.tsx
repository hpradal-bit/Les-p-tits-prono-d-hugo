import type { AdminActionState } from "@/lib/admin/types";

export const numberInput =
  "w-20 rounded-lg border border-line bg-surface px-2 py-2 text-center font-mono text-[15px] " +
  "tabular text-ink focus-visible:border-clay";

export const textInput =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[14px] text-ink " +
  "placeholder:text-ink-faint focus-visible:border-clay";

export const reasonInput = textInput;

/** Le retour d'une action admin, dans les couleurs du jeu. */
export function Feedback({ state }: { state: AdminActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      role="status"
      className={`rounded-lg px-3 py-2 text-[13.5px] ${
        state.status === "success" ? "bg-winner-soft text-winner" : "bg-wrong-soft text-wrong"
      }`}
    >
      {state.message}
    </p>
  );
}
