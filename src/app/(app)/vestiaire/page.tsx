import type { Metadata } from "next";
import { Card, Label } from "@/components/ui";
import { loadFeed, loadReactionChoices } from "@/lib/feed/queries";
import { ReactionBar } from "./_components/reaction-bar";
import { PostForm } from "./_components/post-form";

export const metadata: Metadata = { title: "Le Vestiaire" };
export const dynamic = "force-dynamic";

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

export default async function VestiairePage() {
  const [items, choices] = await Promise.all([loadFeed(), loadReactionChoices()]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">
          Le Vestiaire
        </h1>
        <p className="text-[14px] text-ink-muted">
          Ce qui se dit sur le groupe, et ce que le jeu raconte tout seul.
        </p>
      </div>

      <Card className="p-4">
        <PostForm />
      </Card>

      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <span className="text-3xl" aria-hidden>🏉</span>
          <p className="font-display text-[17px] font-semibold text-ink">
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
                  <p className="text-[15px] leading-snug text-ink">
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
