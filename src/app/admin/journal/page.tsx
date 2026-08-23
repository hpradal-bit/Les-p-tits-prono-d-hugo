import type { Metadata } from "next";
import { Card, Label } from "@/components/ui";
import { loadJournal } from "@/lib/admin/queries";
import { actionLabel } from "@/lib/admin/types";

export const metadata: Metadata = { title: "Journal d'administration" };
export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
  });
}

/** Rend un avant/après lisible sans jargon. */
function Diff({ before, after }: { before: unknown; after: unknown }) {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const changed = keys.filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
  if (changed.length === 0) return null;

  return (
    <ul className="mt-2 flex flex-col gap-0.5">
      {changed.map((k) => (
        <li key={k} className="font-mono text-[11.5px] text-ink-muted">
          {k} : <span className="text-wrong">{JSON.stringify(b[k]) ?? "—"}</span>
          {" → "}
          <span className="text-winner">{JSON.stringify(a[k]) ?? "—"}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function JournalPage() {
  const entries = await loadJournal();

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-leather/40 bg-leather-soft p-4">
        <p className="text-[14px] leading-relaxed text-ink">
          Chaque action d&apos;administration est écrite ici, avec sa raison, et ne
          peut plus être modifiée ni effacée — pas même par un administrateur.
          Ce journal est <strong>visible par tous les joueurs</strong> : c&apos;est ce
          qui rend le jeu incontestable quand l&apos;arbitre joue aussi.
        </p>
      </Card>

      {entries.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-ink-muted">Aucune action enregistrée pour le moment.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li key={e.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display text-[15px] font-semibold text-ink">
                    {actionLabel(e.action)}
                  </p>
                  <p className="font-mono text-[11px] text-ink-faint">{formatDate(e.createdAt)}</p>
                </div>
                <Label className="mt-1">{e.adminName}</Label>
                {e.reason && (
                  <p className="mt-2 text-[14px] text-ink-muted">
                    Raison : {e.reason}
                  </p>
                )}
                <Diff before={e.before} after={e.after} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
