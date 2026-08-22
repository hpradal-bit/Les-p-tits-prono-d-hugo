import { Card, Label } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ParticipationRow } from "@/lib/predictions/types";

/* ---------------------------------------------------------------------------
   « Marco n'a pas encore joué 2 matchs. »

   On dit QUI est en retard et de COMBIEN de matchs — jamais ce qui a été joué.
   Les chiffres viennent de la fonction `round_participation` (migration 0011),
   qui ne renvoie que des compteurs : le secret des pronostics tient même si
   quelqu'un interroge l'API directement.
   --------------------------------------------------------------------------- */

function avatar(row: ParticipationRow) {
  return row.avatarKind === "emoji" ? row.avatarValue : "🏉";
}

function sentence(row: ParticipationRow): string {
  if (row.total === 0) return "aucun match à jouer";
  if (row.missing === 0) return "a tout joué";
  return `n'a pas encore joué ${row.missing} match${row.missing > 1 ? "s" : ""}`;
}

export function Participation({
  rows,
  meId,
}: {
  rows: ParticipationRow[];
  meId: string;
}) {
  if (rows.length === 0) return null;

  const others = rows.filter((r) => r.userId !== meId);
  if (others.length === 0) return null;

  const late = others.filter((r) => r.missing > 0);

  return (
    <Card className="p-4">
      <Label>Où en sont les autres</Label>
      <ul className="mt-3 flex flex-col gap-2">
        {others.map((row) => (
          <li key={row.userId} className="flex items-center gap-2.5 text-[13px]">
            <span aria-hidden className="text-base leading-none">
              {avatar(row)}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink">
              <span className="font-semibold">{row.firstName || row.displayName}</span>{" "}
              <span className="text-ink-muted">{sentence(row)}</span>
            </span>
            <span
              className={cn(
                "tabular shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px]",
                row.missing === 0
                  ? "bg-winner-soft text-winner"
                  : "bg-surface-sunk text-ink-muted",
              )}
            >
              {row.played}/{row.total}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-faint">
        {late.length === 0
          ? "Tout le monde a joué. Le contenu des pronostics reste secret jusqu'au verrouillage."
          : "Personne ne voit le contenu des pronostics des autres avant le verrouillage — seulement le nombre de matchs joués."}
      </p>
    </Card>
  );
}
