/**
 * Rapprochement des équipes par nom normalisé.
 *
 * C'est le seul endroit où l'on devine quoi que ce soit. Au premier import, on
 * associe le nom donné par le fournisseur à l'une de nos équipes, puis on écrit
 * la correspondance dans `external_refs` : les imports suivants ne devinent
 * plus rien, ils lisent la table.
 *
 * Prudence volontaire : en dessous du seuil de confiance, on ne rapproche pas.
 * Un match non rapproché est signalé dans `sync_runs`, jamais rapproché au
 * hasard — une erreur d'appariement fausserait les points de tout le monde.
 */

/** Une de nos équipes, réduite à ce qui sert au rapprochement. */
export interface TeamCandidate {
  id: string;
  code: string;
  name: string;
  shortName: string;
  city: string | null;
}

export interface TeamMatch {
  team: TeamCandidate;
  score: number;
  /** Comment on a conclu : utile pour le journal de synchronisation. */
  reason: "alias" | "exact" | "token" | "contains";
}

/** Mots qui n'aident pas à distinguer deux clubs français de rugby. */
const NOISE_TOKENS = new Set([
  "rugby",
  "club",
  "rc",
  "cs",
  "us",
  "usa",
  "as",
  "asm",
  "sa",
  "fc",
  "union",
  "sporting",
  "athletic",
  "aviron",
  "olympique",
  "section",
  "1",
  "xv",
]);

/**
 * Normalisation : minuscules, sans accents, sans ponctuation, espaces réduits.
 * `Union Bordeaux-Bègles` → `union bordeaux begles`.
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Les mots utiles d'un nom normalisé (le bruit générique est retiré). */
export function significantTokens(raw: string): string[] {
  const tokens = normalizeName(raw).split(" ").filter(Boolean);
  const useful = tokens.filter((t) => !NOISE_TOKENS.has(t) && t.length > 1);
  // Un nom entièrement fait de bruit (« RC 92 ») garde ses mots : mieux vaut
  // comparer quelque chose que rien.
  return useful.length > 0 ? useful : tokens;
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

/**
 * Table d'alias : `{ "racing 92": "R92" }`, lue depuis `app_settings`
 * (`sync.team_aliases`). Les clés sont normalisées à la lecture, les valeurs
 * sont nos codes d'équipe. Aucun alias n'est codé en dur ici.
 */
export type TeamAliases = Record<string, string>;

export function buildAliasIndex(raw: unknown): TeamAliases {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: TeamAliases = {};
  for (const [alias, code] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof code === "string" && code.trim() !== "") {
      out[normalizeName(alias)] = code.trim().toUpperCase();
    }
  }
  return out;
}

/** Seuil au-dessous duquel on refuse de conclure. */
export const MATCH_THRESHOLD = 0.6;

/**
 * Le degré de ressemblance entre les graphies proposées par le fournisseur et
 * une de nos équipes. 1 = certitude, 0 = rien de commun.
 */
function scoreTeam(
  normalizedNames: string[],
  tokenSets: string[][],
  team: TeamCandidate,
): { score: number; reason: TeamMatch["reason"] } {
  const ourNormalized = [team.name, team.shortName, team.city ?? "", team.code]
    .map(normalizeName)
    .filter(Boolean);

  // Égalité stricte sur une graphie normalisée : on ne cherche pas plus loin.
  if (normalizedNames.some((n) => ourNormalized.includes(n))) {
    return { score: 1, reason: "exact" };
  }

  // Recouvrement des mots utiles.
  const ourTokens = significantTokens(`${team.name} ${team.shortName} ${team.city ?? ""}`);
  let score = 0;
  for (const tokens of tokenSets) score = Math.max(score, jaccard(tokens, ourTokens));
  let reason: TeamMatch["reason"] = "token";

  // Inclusion : « Bordeaux Begles » dans « union bordeaux begles ».
  for (const n of normalizedNames) {
    for (const o of ourNormalized) {
      if (n.length >= 5 && o.length >= 5 && (n.includes(o) || o.includes(n)) && score < 0.9) {
        score = 0.9;
        reason = "contains";
      }
    }
  }

  return { score, reason };
}

/**
 * Rapproche un nom (et ses graphies alternatives) d'une de nos équipes.
 * Renvoie null si aucune correspondance n'atteint le seuil de confiance, ou si
 * deux équipes sont à égalité — dans le doute, on ne tranche pas.
 */
export function matchTeam(
  candidateNames: string[],
  teams: TeamCandidate[],
  aliases: TeamAliases = {},
): TeamMatch | null {
  const names = candidateNames.filter((n) => typeof n === "string" && n.trim() !== "");
  if (names.length === 0) return null;

  // 1. Alias explicite décidé par l'admin : il prime sur tout le reste.
  for (const name of names) {
    const code = aliases[normalizeName(name)];
    if (code) {
      const team = teams.find((t) => t.code.toUpperCase() === code);
      if (team) return { team, score: 1, reason: "alias" };
    }
  }

  const normalizedNames = names.map(normalizeName);
  const tokenSets = names.map(significantTokens);

  const scored = teams
    .map((team) => ({ team, ...scoreTeam(normalizedNames, tokenSets, team) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < MATCH_THRESHOLD) return null;
  // Deux équipes aussi plausibles l'une que l'autre : on préfère ne rien dire.
  if (scored[1] && Math.abs(scored[1].score - best.score) < 1e-9) return null;

  return { team: best.team, score: best.score, reason: best.reason };
}
