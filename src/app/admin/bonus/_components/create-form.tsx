"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { allKinds } from "@/lib/bonus/registry";
import { createBonusQuestion } from "@/lib/bonus/actions";

interface TeamOption {
  value: string;
  label: string;
}

interface RoundOption {
  id: string;
  name: string;
  number: number;
}

export function CreateForm({
  leagueId,
  teams,
  rounds,
}: {
  leagueId: string;
  teams: TeamOption[];
  rounds: RoundOption[];
}) {
  const kinds = allKinds();
  const [kind, setKind] = useState(kinds[0]?.kind ?? "");
  const [prompt, setPrompt] = useState("");
  const [roundId, setRoundId] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Podium
  const [count, setCount] = useState(3);
  const [ptsExact, setPtsExact] = useState(5);
  const [ptsPodium, setPtsPodium] = useState(2);
  const [rankFrom, setRankFrom] = useState<"top" | "bottom">("top");

  // Oui/Non et Choix unique
  const [ptsCorrect, setPtsCorrect] = useState(3);

  // Choix unique : options
  const [options, setOptions] = useState([
    { value: "a", label: "" },
    { value: "b", label: "" },
    { value: "c", label: "" },
  ]);

  // Le plus proche
  const [ptsClosestExact, setPtsClosestExact] = useState(5);
  const [ptsClosest, setPtsClosest] = useState(3);

  // Delai maximum
  const [deadlineEnabled, setDeadlineEnabled] = useState(false);
  const [deadlineDays, setDeadlineDays] = useState(7);
  const [deadlineHours, setDeadlineHours] = useState(0);

  const selected = kinds.find((k) => k.kind === kind);
  const isPodium = kind === "podium";
  const isChoice = kind === "single_choice";
  const isNumeric = kind === "numeric_closest";

  function addOption() {
    const id = String.fromCharCode(97 + options.length);
    setOptions([...options, { value: id, label: "" }]);
  }

  function updateOptionLabel(index: number, label: string) {
    const next = [...options];
    next[index] = { ...next[index], label };
    setOptions(next);
  }

  function removeOption(index: number) {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setPending(true);
    setMessage(null);

    const payload: Record<string, unknown> = {
      leagueId,
      kind,
      prompt: prompt.trim(),
      ...(roundId ? { roundId } : {}),
    };

    if (isPodium) {
      payload.config = { options: teams, count, ...(rankFrom === "bottom" ? { rankFrom: "bottom" } : {}) };
      payload.scoring = { exact_position: ptsExact, in_podium: ptsPodium };
    } else if (isChoice) {
      const validOptions = options.filter((o) => o.label.trim());
      if (validOptions.length < 2) {
        setMessage({ ok: false, text: "Il faut au moins 2 options." });
        setPending(false);
        return;
      }
      payload.config = {
        options: validOptions.map((o, i) => ({
          value: String.fromCharCode(97 + i),
          label: o.label.trim(),
        })),
      };
      payload.scoring = { correct: ptsCorrect };
    } else if (isNumeric) {
      payload.scoring = { exact: ptsClosestExact, closest: ptsClosest };
    } else {
      payload.scoring = { correct: ptsCorrect };
    }

    if (deadlineEnabled) {
      payload.deadlineMinutes = deadlineDays * 24 * 60 + deadlineHours * 60;
    }

    const result = await createBonusQuestion(payload);
    setPending(false);
    setMessage({
      ok: result.status === "success",
      text: result.message ?? "Fait.",
    });
    if (result.status === "success") setPrompt("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Type */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-semibold text-ink">Type de question</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink"
        >
          {kinds.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        {selected && (
          <p className="text-[12px] text-ink-muted">{selected.help}</p>
        )}
      </div>

      {/* Journee (optionnel) */}
      {rounds.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-semibold text-ink">Rattacher a une journee (optionnel)</label>
          <select
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink"
          >
            <option value="">Saison entiere</option>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <p className="text-[12px] text-ink-faint">
            {roundId ? "La question sera visible uniquement sur cette journee." : "La question sera visible toute la saison."}
          </p>
        </div>
      )}

      {/* Question */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-semibold text-ink">Question</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={
            isPodium
              ? "Ex : Qui seront les 3 premiers du Top 14 ?"
              : isChoice
                ? "Ex : Qui sera sacre meilleur joueur ?"
                : isNumeric
                  ? "Ex : Combien de points marquera Toulouse ce week-end ?"
                  : "Ex : Toulouse va-t-il gagner samedi ?"
          }
          className="rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-faint"
        />
      </div>

      {/* === PODIUM === */}
      {isPodium && (
        <>
          <div className="rounded-lg border border-line bg-surface-sunk p-3">
            <p className="mb-2 text-[13px] font-semibold text-ink">Configuration du podium</p>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <label className="text-[13px] text-ink-muted">Type</label>
                <select
                  value={rankFrom}
                  onChange={(e) => setRankFrom(e.target.value as "top" | "bottom")}
                  className="rounded-md border border-line bg-surface px-2 py-1.5 text-[14px] font-bold text-ink"
                >
                  <option value="top">Les premiers (Top)</option>
                  <option value="bottom">Les derniers (Bottom)</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-[13px] text-ink-muted">Nombre de places</label>
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-[14px] font-bold text-ink"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            <p className="mt-2 text-[12px] text-ink-faint">
              {teams.length} equipes du championnat seront proposees dans les menus deroulants.
              {rankFrom === "bottom" && " Le reglement automatique lira le classement par le bas."}
            </p>

            {/* Apercu des menus */}
            <div className="mt-3 flex flex-col gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Apercu joueur
              </p>
              {Array.from({ length: count }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-8 text-right text-[13px] font-bold text-ink-muted">
                    {i === 0 ? "1er" : `${i + 1}e`}
                  </span>
                  <select disabled className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink-muted">
                    <option>— {teams[0]?.label ?? "Equipe"}, {teams[1]?.label ?? "..."}, etc. —</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Bareme podium */}
          <div className="rounded-lg border border-line bg-surface-sunk p-3">
            <p className="mb-2 text-[13px] font-semibold text-ink">Bareme</p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <label className="flex-1 text-[13px] text-ink-muted">
                  Bonne equipe a la bonne place
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={ptsExact}
                    onChange={(e) => setPtsExact(Number(e.target.value))}
                    className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-[14px] font-bold text-ink"
                  />
                  <span className="text-[13px] text-ink-muted">pts</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex-1 text-[13px] text-ink-muted">
                  Bonne equipe mais pas a la bonne place
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={ptsPodium}
                    onChange={(e) => setPtsPodium(Number(e.target.value))}
                    className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-[14px] font-bold text-ink"
                  />
                  <span className="text-[13px] text-ink-muted">pts</span>
                </div>
              </div>
            </div>
            <p className="mt-2 text-[12px] text-ink-faint">
              Max possible : {ptsExact * count} pts ({count} x {ptsExact})
            </p>
          </div>
        </>
      )}

      {/* === CHOIX UNIQUE === */}
      {isChoice && (
        <>
          <div className="rounded-lg border border-line bg-surface-sunk p-3">
            <p className="mb-2 text-[13px] font-semibold text-ink">Options de reponse</p>
            <div className="flex flex-col gap-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-6 text-center text-[13px] font-bold text-ink-muted">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <input
                    type="text"
                    value={opt.label}
                    onChange={(e) => updateOptionLabel(i, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    className="flex-1 rounded-md border border-line bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="text-[13px] text-wrong hover:underline"
                    >
                      Retirer
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addOption}
              className="mt-2 text-[13px] font-semibold text-clay hover:underline"
            >
              + Ajouter une option
            </button>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-[13px] text-ink-muted">Points pour la bonne reponse</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={20}
                value={ptsCorrect}
                onChange={(e) => setPtsCorrect(Number(e.target.value))}
                className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-[14px] font-bold text-ink"
              />
              <span className="text-[13px] text-ink-muted">pts</span>
            </div>
          </div>
        </>
      )}

      {/* === OUI / NON === */}
      {kind === "yes_no" && (
        <div className="flex items-center gap-3">
          <label className="text-[13px] text-ink-muted">Points pour la bonne reponse</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={20}
              value={ptsCorrect}
              onChange={(e) => setPtsCorrect(Number(e.target.value))}
              className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-[14px] font-bold text-ink"
            />
            <span className="text-[13px] text-ink-muted">pts</span>
          </div>
        </div>
      )}

      {/* === LE PLUS PROCHE === */}
      {isNumeric && (
        <div className="rounded-lg border border-line bg-surface-sunk p-3">
          <p className="mb-2 text-[13px] font-semibold text-ink">Bareme</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <label className="flex-1 text-[13px] text-ink-muted">Reponse exacte (pile)</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={ptsClosestExact}
                  onChange={(e) => setPtsClosestExact(Number(e.target.value))}
                  className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-[14px] font-bold text-ink"
                />
                <span className="text-[13px] text-ink-muted">pts</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex-1 text-[13px] text-ink-muted">Le plus proche</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={ptsClosest}
                  onChange={(e) => setPtsClosest(Number(e.target.value))}
                  className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-[14px] font-bold text-ink"
                />
                <span className="text-[13px] text-ink-muted">pts</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === DELAI MAXIMUM === */}
      <div className="rounded-lg border border-line bg-surface-sunk p-3">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <input
              type="checkbox"
              checked={deadlineEnabled}
              onChange={(e) => setDeadlineEnabled(e.target.checked)}
              className="rounded"
            />
            Delai maximum pour repondre
          </label>
        </div>
        {deadlineEnabled && (
          <div className="mt-2 flex items-center gap-3">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={90}
                value={deadlineDays}
                onChange={(e) => setDeadlineDays(Number(e.target.value))}
                className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-[14px] font-bold text-ink"
              />
              <span className="text-[13px] text-ink-muted">jours</span>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={23}
                value={deadlineHours}
                onChange={(e) => setDeadlineHours(Number(e.target.value))}
                className="w-16 rounded-md border border-line bg-surface px-2 py-1.5 text-center text-[14px] font-bold text-ink"
              />
              <span className="text-[13px] text-ink-muted">heures</span>
            </div>
          </div>
        )}
        <p className="mt-1.5 text-[12px] text-ink-faint">
          {deadlineEnabled
            ? `La question se fermera automatiquement ${deadlineDays}j ${deadlineHours}h apres son ouverture.`
            : "Sans delai, la question restera ouverte jusqu'a fermeture manuelle."}
        </p>
      </div>

      {message && (
        <p className={`text-[13px] font-semibold ${message.ok ? "text-winner" : "text-wrong"}`}>
          {message.text}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending || !prompt.trim() || (isPodium && teams.length < count)}
        size="sm"
      >
        {pending ? "Creation…" : "Creer le brouillon"}
      </Button>
    </form>
  );
}
