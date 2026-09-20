import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Card, Label } from "@/components/ui";
import { LeagueSwitcher } from "@/components/league-switcher";
import { PlayerAvatar } from "../_components/player-avatar";
import { getViewer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveLeagueId } from "@/lib/leagues/queries.ts";
import { loadClubAvatars } from "@/lib/auth/avatar-policy";
import { loadFeed, loadReactionChoices } from "@/lib/feed/queries";
import { loadLastDebrief } from "@/lib/feed/debrief";
import { loadChambrage } from "@/lib/chambrage/queries.ts";
import { ChambrageChat } from "./_components/chambrage/chat";
import { ReactionBar } from "./_components/reaction-bar";
import { MarkFeedRead } from "./_components/mark-read";
import { RoundDebrief } from "./_components/round-debrief";
import { PowerHistoryView } from "./_components/power-history";
import { loadPowerHistory } from "@/lib/powers/history";

export const metadata: Metadata = { title: "Zone de chambrage" };
export const dynamic = "force-dynamic";

/**
 * Trois onglets : « Chambrage » est la vraie messagerie de groupe (§ refonte),
 * « Résumé » ce que le jeu raconte tout seul (scores exacts, dépassements,
 * séries noires…), « Super-pouvoirs » un écran à part, rangé par journée et
 * filtrable par joueur.
 */
const TABS = ["chambrage", "resume", "pouvoirs"] as const;
type Tab = (typeof TABS)[number];

const FilterSchema = z.object({
  filtre: z.enum(TABS).catch("chambrage"),
  joueur: z.string().uuid().optional(),
  league: z.string().uuid().optional(),
});

const TAB_LABELS: { value: Tab; label: string }[] = [
  { value: "chambrage", label: "Chambrage" },
  { value: "resume", label: "Résumé" },
  { value: "pouvoirs", label: "Super-pouvoirs" },
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
  searchParams: Promise<{ filtre?: string; joueur?: string; league?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/connexion");

  const sb = await createClient();
  const { filtre, joueur, league: requested } = FilterSchema.parse(await searchParams);
  const resolved = await resolveLeagueId(sb, viewer.id, requested);
  if (!resolved) redirect("/accueil");
  const { leagueId, leagues: myLeagues } = resolved;

  const showPowers = filtre === "pouvoirs";
  const showResume = filtre === "resume";
  const showChambrage = filtre === "chambrage";

  const [choices, clubs, debrief, resumeItems, powerHistory, chambrage] = await Promise.all([
    loadReactionChoices(),
    loadClubAvatars(sb),
    showResume ? loadLastDebrief(leagueId) : Promise.resolve(null),
    showResume ? loadFeed(leagueId, "jeu") : Promise.resolve([]),
    showPowers ? loadPowerHistory(sb, leagueId, { playerId: joueur ?? null }) : Promise.resolve(null),
    showChambrage ? loadChambrage(sb, leagueId, viewer.id) : Promise.resolve(null),
  ]);

  const withLeague = (href: string) =>
    href.includes("?") ? `${href}&league=${leagueId}` : `${href}?league=${leagueId}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Sur le fil de jeu : ouvrir l'écran vaut lecture. Chambrage marque sa
          propre lecture, sur ses propres tables. */}
      {showResume && <MarkFeedRead leagueId={leagueId} />}

      <div>
        <h1 className="font-display text-2xl tracking-tight text-ink">
          Zone de chambrage
        </h1>
        <p className="text-[14px] text-ink-muted">
          Ce qui se dit sur la ligue, et ce que le jeu raconte tout seul.
        </p>
      </div>

      <LeagueSwitcher
        options={myLeagues.map((l) => ({
          value: l.leagueId,
          label: l.leagueName,
          href: `/vestiaire?league=${l.leagueId}`,
        }))}
        current={leagueId}
      />

      {/* Les onglets : une barre soulignée, pas des pastilles — c'est une
          navigation entre trois écrans, pas un filtre parmi d'autres. */}
      <nav className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto border-b border-line px-4">
        {TAB_LABELS.map((t) => (
          <Link
            key={t.value}
            href={withLeague(t.value === "chambrage" ? "/vestiaire" : `/vestiaire?filtre=${t.value}`)}
            aria-current={filtre === t.value ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-[13.5px] font-semibold transition ${
              filtre === t.value
                ? "border-b-clay text-clay"
                : "border-b-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {showChambrage && chambrage && (
        <ChambrageChat
          leagueId={leagueId}
          viewerId={viewer.id}
          viewerName={viewer.displayName}
          roster={chambrage.roster}
          clubs={clubs}
          reactionChoices={choices}
          initial={{
            messages: chambrage.messages,
            hasMoreOlder: chambrage.hasMoreOlder,
            reactions: chambrage.reactions,
            reads: chambrage.reads,
            lastReadAt: chambrage.lastReadAt,
          }}
        />
      )}

      {showPowers && powerHistory && (
        <PowerHistoryView
          history={powerHistory}
          selectedPlayer={joueur ?? null}
          clubs={clubs}
          hrefFor={(playerId) =>
            withLeague(
              playerId
                ? `/vestiaire?filtre=pouvoirs&joueur=${playerId}`
                : "/vestiaire?filtre=pouvoirs",
            )
          }
        />
      )}

      {showResume && (
        <>
          <RoundDebrief data={debrief} />

          {resumeItems.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 p-8 text-center">
              <span className="text-3xl" aria-hidden>🏉</span>
              <p className="font-display text-[17px] text-ink">Rien à raconter pour l&apos;instant</p>
              <p className="max-w-[36ch] text-[14px] text-ink-muted">
                Il se remplira tout seul au fil des journées : scores exacts, dépassements au
                classement, séries noires.
              </p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {resumeItems.map((item) => (
                <li key={item.id}>
                  <Card className={`p-4 ${item.rendered ? TONE[item.rendered.tone] : "border-line"}`}>
                    {item.rendered ? (
                      <p className="whitespace-pre-wrap text-[15px] leading-snug text-ink">
                        <span className="mr-1.5" aria-hidden>{item.rendered.emoji}</span>
                        {item.rendered.text}
                      </p>
                    ) : (
                      <div className="flex items-start gap-2.5">
                        <PlayerAvatar
                          player={{
                            userId: "",
                            firstName: item.authorFirstName ?? "",
                            displayName: item.authorName ?? "",
                            avatarKind: item.authorAvatarKind ?? "emoji",
                            avatarValue: item.authorAvatarValue ?? "🏉",
                          }}
                          clubs={clubs}
                          size={32}
                        />
                        <div className="min-w-0 flex-1">
                          <Label>{item.authorName ?? "Un joueur"}</Label>
                          <p className="mt-1 whitespace-pre-wrap text-[15px] leading-snug text-ink">
                            {item.body}
                          </p>
                        </div>
                      </div>
                    )}
                    <p className="mt-1.5 font-mono text-[11px] text-ink-faint">{ago(item.createdAt)}</p>
                    <ReactionBar postId={item.id} reactions={item.reactions} choices={choices} />
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
