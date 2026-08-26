"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function KeyCopy({ joinKey }: { joinKey: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-ink-muted">Clé de la ligue</span>
      <div className="flex items-center gap-2">
        <span className="flex-1 rounded-xl bg-surface-sunk px-4 py-3 font-mono text-xl tracking-[0.2em] text-ink">
          {joinKey}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(joinKey);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Presse-papiers indisponible : la clé reste lisible à l'écran.
            }
          }}
        >
          {copied ? "Copiée ✓" : "Copier"}
        </Button>
      </div>
    </div>
  );
}
