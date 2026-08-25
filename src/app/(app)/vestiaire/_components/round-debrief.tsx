import { cn } from "@/lib/cn";

interface DebriefData {
  roundName: string;
  bestPlayer: string | null;
  bestPoints: number | null;
  leader: string | null;
  leaderPoints: number | null;
  exactScores: number;
  biggestDrop: string | null;
  dropFrom: number | null;
  dropTo: number | null;
  worstMatch: string | null;
  worstMatchErrors: number | null;
}

export function RoundDebrief({ data }: { data: DebriefData | null }) {
  if (!data) return null;

  const stats: { emoji: string; label: string; value: string; accent?: string }[] = [];

  if (data.bestPlayer && data.bestPoints !== null) {
    stats.push({
      emoji: "🏆",
      label: "Meilleur joueur",
      value: `${data.bestPlayer} — ${data.bestPoints} pts`,
      accent: "text-winner",
    });
  }

  if (data.leader && data.leaderPoints !== null) {
    stats.push({
      emoji: "👑",
      label: "En tête",
      value: `${data.leader} — ${data.leaderPoints} pts`,
      accent: "text-clay",
    });
  }

  if (data.exactScores > 0) {
    stats.push({
      emoji: "🎯",
      label: "Scores exacts",
      value: `${data.exactScores} score${data.exactScores > 1 ? "s" : ""} exact${data.exactScores > 1 ? "s" : ""}`,
      accent: "text-perfect",
    });
  }

  if (data.biggestDrop && data.dropFrom !== null && data.dropTo !== null) {
    stats.push({
      emoji: "📉",
      label: "Plus grosse chute",
      value: `${data.biggestDrop} : ${data.dropFrom}e → ${data.dropTo}e`,
      accent: "text-wrong",
    });
  }

  if (data.worstMatch && data.worstMatchErrors !== null) {
    stats.push({
      emoji: "💀",
      label: "Match piège",
      value: `${data.worstMatch} — ${data.worstMatchErrors} erreur${data.worstMatchErrors > 1 ? "s" : ""}`,
    });
  }

  if (stats.length === 0) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="text-lg" aria-hidden>📋</span>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Débriefing — {data.roundName}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {stats.map((stat, i) => (
          <div
            key={i}
            className={cn(
              "flex flex-col gap-1 rounded-2xl border border-line bg-surface p-3",
              i === 0 && stats.length % 2 !== 0 && "col-span-2",
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm" aria-hidden>{stat.emoji}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                {stat.label}
              </span>
            </div>
            <p className={cn("text-[13px] font-bold", stat.accent ?? "text-ink")}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
