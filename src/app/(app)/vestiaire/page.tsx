import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Card, Label } from "@/components/ui";
import { loadFeed, loadReactionChoices, type FeedFilter } from "@/lib/feed/queries";
import { loadLastDebrief } from "@/lib/feed/debrief";
import { ReactionBar } from "./_components/reaction-bar";
import { PostForm } from "./_components/post-form";
import { RoundDebrief } from "./_components/round-debrief";

export const metadata: Metadata = { title: "Le Vestiaire" };
export const dynamic = "force-dynamic";

const FilterSchema = z.object({
  filtre: z.enum(["tout", "jeu", "pouvoirs", "messages"]).catch("tout"),
});

const FILTER_LABELS: { value: FeedFilter; label: string }[] = [
  { value: "tout", label: "Tout" },
  { value: "jeu", label: "Jeu" },
  { value: "pouvoirs", label: "Pouvoirs" },
  { value: "messages", label: "Messages" },
];

const TONE: Record<string, string> = {
  neutral: "border-line",
  good: "border-l-[3px] border-l-winner",
  bad: "border-l-[3px] border-l-wrong",
  gold: "border-l-[3px] border-l-perfect",
};

function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "hier" : `il y a ${days} jours`;
}

export default async function VestiairePage({
  searchParams,
}: {
  searchParams: Promise<{ filtre?: string }>;
}) {
  const { filtre } = FilterSchema.parse(await searchParams);
  const [items, choices, debrief] = await Promise.all([
    loadFeed(filtre),
    loadReactionChoices(),
    loadLastDebrief(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-ink">
          Le Vestiaire
        </h1>
        <p className="text-[14px] text-ink-muted">
          Ce qui se dit sur le groupe, et ce que le jeu raconte tout seul.
        </p>
      </div>

      <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {FILTER_LABELS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "tout" ? "/vestiaire" : `/vestiaire?filtre=${f.value}`}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
              filtre === f.value
                ? "bg-clay text-surface"
                : "border border-line bg-surface text-ink-muted hover:bg-surface-sunk"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <RoundDebrief data={debrief} />

      <Card className="p-4">
        <PostForm />
      </Card>

      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <span className="text-3xl" aria-hidden>🏉</span>
          <p className="font-display text-[17px] text-ink">
            Le vestiaire est encore vide
          </p>
          <p className="max-w-[36ch] text-[14px] text-ink-muted">
            Il se remplira tout seul dès la première journée : scores exacts,
            dépassements au classement, séries noires. En attendant, rien
            n&apos;empêche de lancer les hostilités.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => (
            <li key={item.id}>
              <Card className={`p-4 ${item.rendered ? TONE[item.rendered.tone] : "border-line"}`}>
                {item.rendered ? (
                  <p className="whitespace-pre-wrap text-[15px] leading-snug text-ink">
                    <span className="mr-1.5" aria-hidden>{item.rendered.emoji}</span>
                    {item.rendered.text}
                  </p>
                ) : (
                  <>
                    <Label>{item.authorName ?? "Un joueur"}</Label>
                    <p className="mt-1 whitespace-pre-wrap text-[15px] leading-snug text-ink">
                      {item.body}
                    </p>
                  </>
                )}
                <p className="mt-1.5 font-mono text-[11px] text-ink-faint">{ago(item.createdAt)}</p>
                <ReactionBar postId={item.id} reactions={item.reactions} choices={choices} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
