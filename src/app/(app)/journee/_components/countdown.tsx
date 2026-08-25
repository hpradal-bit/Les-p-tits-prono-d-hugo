"use client";

import { useState, useEffect } from "react";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatRemaining(target: Date): string | null {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return null;

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  if (days > 0) return `${days}j ${pad(hours)}h ${pad(minutes)}m`;
  if (hours > 0) return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  return `${pad(minutes)}m ${pad(seconds)}s`;
}

export function Countdown({ targetIso }: { targetIso: string }) {
  const target = new Date(targetIso);
  const [remaining, setRemaining] = useState<string | null>(() => formatRemaining(target));

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(formatRemaining(target));
    }, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  if (!remaining) return null;

  return (
    <span className="rounded-full bg-sage-soft px-3 py-1.5 font-mono text-[12px] font-semibold tabular text-sage">
      Verrou dans {remaining}
    </span>
  );
}
