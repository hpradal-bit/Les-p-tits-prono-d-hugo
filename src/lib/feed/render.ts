/**
 * Mise en mots du flux d'événements.
 *
 * Règle n° 8 : le Vestiaire est un **lecteur** de la table `events`. Il ne
 * recalcule jamais la logique du jeu — il la raconte. Toute la fonction est
 * pure : mêmes entrées, même phrase, donc testable sans base.
 */

export interface FeedEvent {
  id: string;
  kind: string;
  actorName: string | null;
  targetName: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface RenderedEvent {
  emoji: string;
  text: string;
  /** Ton de la publication, pour la teinte de la carte. */
  tone: "neutral" | "good" | "bad" | "gold";
}

function num(payload: Record<string, unknown>, key: string): number | null {
  const v = payload[key];
  return typeof v === "number" ? v : null;
}

function str(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function plural(n: number, one: string, many: string): string {
  return n > 1 ? many : one;
}

type Renderer = (e: FeedEvent) => RenderedEvent | null;

const RENDERERS: Record<string, Renderer> = {
  member_joined: (e) => ({
    emoji: "👋",
    tone: "neutral",
    text: `${e.actorName ?? "Un joueur"} rejoint le groupe.`,
  }),

  exact_score: (e) => {
    const h = num(e.payload, "home_score");
    const a = num(e.payload, "away_score");
    const score = h !== null && a !== null ? ` (${h}-${a})` : "";
    return {
      emoji: "👌",
      tone: "gold",
      text: `${e.actorName ?? "Quelqu'un"} place un score exact${score}. +10.`,
    };
  },

  leader_change: (e) => ({
    emoji: "👑",
    tone: "gold",
    text: `${e.actorName ?? "Quelqu'un"} prend la première place.`,
  }),

  overtake: (e) => ({
    emoji: "🔥",
    tone: "good",
    text: `${e.actorName ?? "Quelqu'un"} vient de doubler ${e.targetName ?? "un adversaire"}.`,
  }),

  bad_streak: (e) => {
    const n = num(e.payload, "length") ?? 0;
    return {
      emoji: "💀",
      tone: "bad",
      text: `${e.actorName ?? "Quelqu'un"} en est à ${n} ${plural(n, "prono raté", "pronos ratés")} d'affilée.`,
    };
  },

  auto_prediction: (e) => ({
    emoji: "😴",
    tone: "bad",
    text: `${e.actorName ?? "Quelqu'un"} a laissé le système jouer à sa place.`,
  }),

  round_locked: (e) => {
    const round = str(e.payload, "round_name") ?? "La journée";
    const auto = num(e.payload, "auto_predictions");
    const suffix =
      auto && auto > 0
        ? ` ${auto} ${plural(auto, "prono a été joué", "pronos ont été joués")} automatiquement.`
        : "";
    return { emoji: "🔒", tone: "neutral", text: `${round} est verrouillée.${suffix}` };
  },

  round_settled: (e) => {
    const round = str(e.payload, "round_name") ?? "La journée";
    const summary = e.payload.summary;
    const lines = Array.isArray(summary) ? (summary as string[]) : [];
    const text = lines.length > 0
      ? lines.join("\n")
      : `${round} est terminée. Le classement est à jour.`;
    return { emoji: "🏆", tone: "good", text };
  },

  fixture_finished: (e) => {
    const home = str(e.payload, "homeTeam") ?? "Domicile";
    const away = str(e.payload, "awayTeam") ?? "Extérieur";
    const h = num(e.payload, "homeScore");
    const a = num(e.payload, "awayScore");
    const score = h !== null && a !== null ? `${h}-${a}` : "?-?";
    return {
      emoji: "🏉",
      tone: "neutral",
      text: `Coup de sifflet final : ${home} ${score} ${away}.`,
    };
  },

  bonus_question: (e) => {
    const prompt = str(e.payload, "prompt") ?? "une question bonus";
    return {
      emoji: "🎯",
      tone: "neutral",
      text: `Nouvelle question bonus : ${prompt}`,
    };
  },

  admin_action: (e) => {
    const reason = str(e.payload, "reason");
    const label = str(e.payload, "action") ?? "Modification";
    return {
      emoji: "⚖️",
      tone: "neutral",
      text: reason ? `Intervention de l'arbitre — ${reason}` : `Intervention de l'arbitre — ${label}`,
    };
  },

  power_declared: (e) => {
    const emoji = str(e.payload, "power_emoji") ?? "⚡";
    const name = str(e.payload, "power_name") ?? "un pouvoir";
    const target = e.targetName ? ` contre ${e.targetName}` : "";
    return {
      emoji,
      tone: "neutral",
      text: `${e.actorName ?? "Quelqu'un"} active ${name}${target} !`,
    };
  },

  power_resolved: (e) => {
    const emoji = str(e.payload, "power_emoji") ?? "⚡";
    const name = str(e.payload, "power_name") ?? "un pouvoir";
    const outcome = e.payload.outcome as Record<string, unknown> | null;
    const winner = outcome?.winnerId as string | null;
    const transferred = num(outcome ?? {}, "transferred");
    if (winner && transferred) {
      return {
        emoji,
        tone: "gold",
        text: `${name} résolu : ${transferred} point${transferred > 1 ? "s" : ""} transférés !`,
      };
    }
    const bonus = num(outcome ?? {}, "bonus");
    if (bonus && bonus > 0) {
      return {
        emoji,
        tone: "good",
        text: `${e.actorName ?? "Quelqu'un"} empoche ${bonus} point${bonus > 1 ? "s" : ""} bonus grâce à ${name}.`,
      };
    }
    return { emoji, tone: "neutral", text: `${name} résolu.` };
  },
};

/** Rend un événement, ou `null` s'il n'a rien à raconter au groupe. */
export function renderEvent(event: FeedEvent): RenderedEvent | null {
  const renderer = RENDERERS[event.kind];
  return renderer ? renderer(event) : null;
}

/** Les types d'événements qui produisent une publication. */
export const RENDERED_KINDS = Object.keys(RENDERERS);

/**
 * Le résumé de journée, à partir d'un gabarit à trous stocké en base.
 *
 * Une ligne dont un trou ne peut pas être rempli est **omise** plutôt que
 * rendue avec un blanc : mieux vaut un résumé plus court qu'une phrase bancale.
 * Aucun modèle de langage n'intervient — la donnée d'abord, le style ensuite.
 */
export function fillSummary(
  template: string[],
  values: Record<string, string | number | null | undefined>,
): string[] {
  const lines: string[] = [];

  for (const line of template) {
    const holes = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const missing = holes.some((h) => values[h] === null || values[h] === undefined);
    if (missing) continue;
    lines.push(line.replace(/\{(\w+)\}/g, (_, h: string) => String(values[h])));
  }

  return lines;
}
