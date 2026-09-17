/**
 * Le verdict d'un pouvoir : gagné, perdu, sans effet, ou encore en attente.
 *
 * Fonction pure, sans base ni réseau : c'est elle qui décide de ce qu'affiche
 * l'onglet Super-pouvoirs. Le fil de chambrage raconte la même chose en
 * phrases (`feed/render.ts`) ; ici on rend des données structurées, pour
 * pouvoir grouper, filtrer et colorer.
 *
 * Chaque pouvoir a sa propre notion de réussite, et elle ne se déduit pas du
 * seul signe des points : un Espion ne déplace rien et réussit quand même, un
 * Sabotage réussit en faisant perdre des points à *quelqu'un d'autre*.
 */

export type PowerVerdict = "gagne" | "perdu" | "neutre" | "attente";

export interface VerdictResult {
  verdict: PowerVerdict;
  /** Une ligne courte, lisible telle quelle à côté du nom du pouvoir. */
  detail: string;
  /** Points gagnés (positif) ou perdus (négatif) par celui qui a activé. */
  delta: number | null;
}

function n(source: Record<string, unknown>, key: string): number | null {
  const raw = source[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function pts(value: number): string {
  const abs = Math.abs(value);
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${abs} pt${abs > 1 ? "s" : ""}`;
}

export function powerVerdict(
  code: string,
  state: string,
  outcome: Record<string, unknown> | null,
  options: { actorIsWinner?: boolean | null; targetName?: string | null } = {},
): VerdictResult {
  if (state === "cancelled") {
    return { verdict: "neutre", detail: "annulé, crédits restitués", delta: 0 };
  }
  if (state !== "resolved" || !outcome) {
    return { verdict: "attente", detail: "en attente de résolution", delta: null };
  }

  const who = options.targetName ?? "l'adversaire";

  // Duel — le seul pouvoir où quelqu'un gagne et quelqu'un perd nommément.
  const transferred = n(outcome, "transferred");
  if (outcome.winnerId && transferred !== null) {
    return options.actorIsWinner === false
      ? { verdict: "perdu", detail: `${transferred} pts cédés à ${who}`, delta: -transferred }
      : { verdict: "gagne", detail: `${transferred} pts raflés à ${who}`, delta: transferred };
  }
  if (outcome.winner === null && "initiatorPoints" in outcome) {
    return { verdict: "neutre", detail: "égalité, aucun transfert", delta: 0 };
  }

  // Espion — aucun point ne bouge, mais le pouvoir a bien fait son travail.
  if (code === "spy" || outcome.revealed === true) {
    return { verdict: "gagne", detail: `pronostic de ${who} révélé`, delta: 0 };
  }

  // Sabotage — la réussite se mesure sur la cible, pas sur soi.
  if (code === "sabotage" || "penalty" in outcome) {
    const penalty = n(outcome, "penalty") ?? 0;
    return penalty > 0
      ? { verdict: "gagne", detail: `${penalty} pts retirés à ${who}`, delta: 0 }
      : { verdict: "perdu", detail: "la cible n'avait rien marqué", delta: 0 };
  }

  // Joker et Oracle — un bonus, ou rien.
  const bonus = n(outcome, "bonus");
  if (bonus !== null) {
    return bonus > 0
      ? { verdict: "gagne", detail: `${pts(bonus)} de bonus`, delta: bonus }
      : { verdict: "perdu", detail: "aucun point marqué sur ce match", delta: 0 };
  }

  if (outcome.error) {
    return { verdict: "neutre", detail: "sans effet", delta: 0 };
  }
  return { verdict: "neutre", detail: "résolu", delta: null };
}
