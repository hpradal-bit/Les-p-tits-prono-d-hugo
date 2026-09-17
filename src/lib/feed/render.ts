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
  /** Le match concerné, résolu par l'appelant depuis `outcome.fixtureId`. */
  fixtureLabel?: string | null;
  /** Duel : celui qui a activé le pouvoir est-il le gagnant ? */
  actorIsWinner?: boolean | null;
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

    const lines = [`Debrief ${home} - ${away}`, `${home} ${score} ${away}.`];

    const onHome = num(e.payload, "onHome");
    const onAway = num(e.payload, "onAway");
    const onDraw = num(e.payload, "onDraw");
    if (onHome !== null && onAway !== null) {
      lines.push("");
      lines.push("Les pronostics :");
      lines.push(`• ${onHome} ${plural(onHome, "joueur avait choisi", "joueurs avaient choisi")} ${home}`);
      lines.push(`• ${onAway} ${plural(onAway, "joueur avait choisi", "joueurs avaient choisi")} ${away}`);
      if (onDraw) lines.push(`• ${onDraw} ${plural(onDraw, "joueur avait choisi", "joueurs avaient choisi")} le nul`);
    }

    const exactNames = e.payload.exactNames;
    if (Array.isArray(exactNames) && exactNames.length > 0) {
      lines.push("");
      lines.push(`Score exact : ${exactNames.join(", ")} 🎯`);
    }

    return {
      emoji: "🏉",
      tone: "neutral",
      text: lines.length > 2 ? lines.join("\n") : `Coup de sifflet final : ${home} ${score} ${away}.`,
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
    const match = e.fixtureLabel ? ` sur ${e.fixtureLabel}` : "";
    const cost = num(e.payload, "credit_cost");
    const price = cost ? ` (${cost} cr.)` : "";
    return {
      emoji,
      tone: "neutral",
      text: `${e.actorName ?? "Quelqu'un"} active ${name}${target}${match}${price} !`,
    };
  },

  /**
   * Le verdict d'un pouvoir, en clair : qui, quel pouvoir, sur quel match, et
   * gagné ou perdu. C'est la ligne que les joueurs relisent le lundi pour se
   * chambrer — elle doit se suffire à elle-même, sans aller consulter ailleurs.
   *
   * `delta` (points réellement gagnés ou perdus par celui qui a activé) est
   * posé à l'émission. Les événements antérieurs ne l'ont pas : on retombe
   * alors sur l'issue propre à chaque pouvoir plutôt que d'afficher un verdict
   * faux.
   */
  power_resolved: (e) => {
    const emoji = str(e.payload, "power_emoji") ?? "⚡";
    const name = str(e.payload, "power_name") ?? "un pouvoir";
    const code = str(e.payload, "power_code") ?? "";
    const who = e.actorName ?? "Quelqu'un";
    const outcome = (e.payload.outcome as Record<string, unknown> | null) ?? {};
    const match = e.fixtureLabel ? ` sur ${e.fixtureLabel}` : "";

    const pts = (n: number) => `${n} point${Math.abs(n) > 1 ? "s" : ""}`;

    // Duel : il y a un gagnant et un perdant nommés.
    const transferred = num(outcome, "transferred");
    if (outcome.winnerId && transferred) {
      const won = e.actorIsWinner;
      return {
        emoji,
        tone: won === false ? "bad" : "gold",
        text:
          won === false
            ? `${who} perd son ${name} : ${pts(transferred)} cédés à ${e.targetName ?? "son adversaire"}.`
            : `${who} gagne son ${name} contre ${e.targetName ?? "son adversaire"} : ${pts(transferred)} raflés !`,
      };
    }
    if (outcome.winner === null && "initiatorPoints" in outcome) {
      return { emoji, tone: "neutral", text: `${name} de ${who} : égalité, aucun transfert.` };
    }

    // Espion : aucun point ne bouge, mais l'usage doit se voir.
    if (code === "spy" || outcome.revealed === true) {
      return {
        emoji,
        tone: "neutral",
        text: `${who} a espionné ${e.targetName ?? "un joueur"}${match}.`,
      };
    }

    // Sabotage : le verdict se lit sur la cible.
    const penalty = num(outcome, "penalty");
    if (code === "sabotage" || "penalty" in outcome) {
      return penalty && penalty > 0
        ? {
            emoji,
            tone: "gold",
            text: `${who} sabote ${e.targetName ?? "un joueur"}${match} : ${pts(penalty)} en moins !`,
          }
        : {
            emoji,
            tone: "bad",
            text: `${name} de ${who} dans le vide${match} : la cible n'avait rien marqué.`,
          };
    }

    // Joker et Oracle : un bonus, ou rien.
    const bonus = num(outcome, "bonus");
    if (bonus && bonus > 0) {
      return {
        emoji,
        tone: "good",
        text: `${who} empoche ${pts(bonus)} bonus avec ${name}${match}.`,
      };
    }
    if (outcome.bonus === 0 || bonus === 0) {
      return {
        emoji,
        tone: "bad",
        text: `${name} de ${who} perdu${match} : aucun point marqué sur ce match.`,
      };
    }

    const delta = num(e.payload, "delta");
    if (delta) {
      return {
        emoji,
        tone: delta > 0 ? "good" : "bad",
        text: `${name} de ${who}${match} : ${delta > 0 ? "+" : ""}${pts(delta)}.`,
      };
    }
    return { emoji, tone: "neutral", text: `${name} de ${who} résolu${match}.` };
  },

  badge_earned: (e) => {
    const emoji = str(e.payload, "badge_emoji") ?? "🏅";
    const name = str(e.payload, "badge_name") ?? "un badge";
    return {
      emoji,
      tone: "gold",
      text: `${e.actorName ?? "Quelqu'un"} décroche le badge ${name} !`,
    };
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
