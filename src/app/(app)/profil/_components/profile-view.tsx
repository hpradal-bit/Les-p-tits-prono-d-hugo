import Link from "next/link";
import { Card, Label } from "@/components/ui";
import { PlayerAvatar } from "../../_components/player-avatar";
import type { ClubAvatar } from "@/lib/auth/avatars";
import type { PlayerProfile } from "@/lib/stats/profile";

/** Une statistique, grand chiffre et légende. */
function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="tabular font-display text-2xl leading-none text-ink">
        {value}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </span>
    </div>
  );
}

function pct(v: number | null) {
  return v === null ? "—" : `${Math.round(v * 100)} %`;
}

export function ProfileView({
  profile,
  others,
  isMe,
  leagueId,
  clubs = [],
}: {
  profile: PlayerProfile;
  others: PlayerProfile[];
  isMe: boolean;
  /** Pour rester dans la même ligue en comparant deux fiches. */
  leagueId: string;
  clubs?: readonly ClubAvatar[];
}) {
  const s = profile.streaks;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col items-center gap-3 p-6">
        <div className="relative">
          <PlayerAvatar player={profile.player} clubs={clubs} size={80} />
          {profile.played > 0 && (
            <span className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-full bg-clay font-mono text-[13px] font-bold text-surface shadow-sm">
              {profile.rank}
            </span>
          )}
        </div>
        <div className="text-center">
          <h1 className="font-display text-[26px] leading-none tracking-tight text-ink">
            {profile.player.displayName}
          </h1>
          <p className="mt-1 font-mono text-[12px] text-ink-muted">
            {profile.played === 0
              ? "Pas encore de pronostic"
              : `${profile.rank}${profile.rank === 1 ? "er" : "e"} sur ${profile.fieldSize} · ${profile.points} pt${profile.points > 1 ? "s" : ""}`}
          </p>
        </div>
      </Card>

      <Card className="grid grid-cols-3 gap-5 p-5">
        <Stat value={profile.points} label="Points" />
        <Stat value={pct(profile.successRate)} label="Réussite" />
        <Stat value={profile.played} label="Pronostics" />
        <Stat value={profile.goodWinners} label="Bons vainqueurs" />
        <Stat value={profile.goodMargins} label="Bons écarts" />
        <Stat value={profile.exactScores} label="Scores exacts 👌" />
        <Stat value={profile.roundsWon} label="Journées gagnées" />
        <Stat value={profile.podiums} label="Podiums" />
        <Stat
          value={s.bad.current > 0 ? s.bad.current : s.good.current}
          label={s.bad.current > 0 ? "Série noire 💀" : "Série en cours 🔥"}
        />
        <Stat value={s.good.best} label="Meilleure série 🔥" />
        <Stat value={s.bad.best} label="Pire série 💀" />
      </Card>

      {(profile.bestRound || profile.worstRound) && (
        <Card className="flex flex-col gap-3 p-5">
          <Label>Les extrêmes</Label>
          {profile.bestRound && (
            <p className="text-[14px] text-ink">
              Meilleure journée : <strong>{profile.bestRound.round.name}</strong> avec{" "}
              <span className="tabular text-perfect">{profile.bestRound.points} pts</span>
            </p>
          )}
          {profile.worstRound && (
            <p className="text-[14px] text-ink">
              Pire journée : <strong>{profile.worstRound.round.name}</strong> avec{" "}
              <span className="tabular text-wrong">{profile.worstRound.points} pts</span>
            </p>
          )}
        </Card>
      )}

      {profile.history.length > 0 && (
        <Card className="p-5">
          <Label className="mb-3">Journée après journée</Label>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[380px] text-[14px]">
              <thead>
                <tr className="border-b border-line">
                  {["Journée", "Points", "Place", "Général", "Évol."].map((h) => (
                    <th key={h} className="pb-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profile.history.map((r) => (
                  <tr key={r.round.id} className="border-b border-line last:border-none">
                    <td className="py-2 font-semibold text-ink">{r.round.name}</td>
                    <td className="tabular py-2 text-ink">{r.points}</td>
                    <td className="tabular py-2 text-ink-muted">{r.position}e</td>
                    <td className="tabular py-2 text-ink-muted">{r.overallPosition}e</td>
                    <td className="tabular py-2">
                      {r.movement === null || r.movement === 0 ? (
                        <span className="text-ink-faint">—</span>
                      ) : r.movement > 0 ? (
                        <span className="text-winner">↑ {r.movement}</span>
                      ) : (
                        <span className="text-wrong">↓ {Math.abs(r.movement)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {isMe && others.length > 0 && (
        <Card className="p-5">
          <Label className="mb-3">Se comparer</Label>
          <ul className="flex flex-col gap-1">
            {others.map((o) => (
              <li key={o.player.userId}>
                <Link
                  href={`/profil/${o.player.userId}?league=${leagueId}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-sunk"
                >
                  <PlayerAvatar player={o.player} clubs={clubs} size={32} />
                  <span className="flex-1 truncate text-[15px] text-ink">{o.player.displayName}</span>
                  <span className="tabular font-mono text-[13px] text-ink-muted">{o.points} pts</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isMe && (
        <div className="flex flex-col gap-2">
          <Link
            href="/reglages"
            className="rounded-full border border-line-strong py-3.5 text-center text-[15px] font-bold text-ink"
          >
            Réglages et notifications
          </Link>
        </div>
      )}
    </div>
  );
}
