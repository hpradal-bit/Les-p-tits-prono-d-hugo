import type { ProviderTeam } from "./types.ts";

/**
 * Amorcer l'effectif d'une compétition à partir de ce que dit le fournisseur.
 *
 * Le rapprochement d'équipes ne crée jamais d'équipe, et c'est voulu : sur une
 * saison en cours, une graphie inhabituelle doit produire un avertissement, pas
 * un doublon silencieux. Mais cette prudence rend une *nouvelle* compétition
 * impossible à ajouter sans saisir tout son effectif à la main — seize clubs
 * pour la Pro D2, avec leurs noms exacts, avant même de savoir si le
 * fournisseur répond.
 *
 * D'où cette exception, volontairement étroite : **uniquement quand la saison
 * ne compte aucune équipe**. Une saison vide ne peut pas produire de doublon,
 * puisqu'il n'y a rien à dupliquer. Dès la première équipe enregistrée, le
 * garde-fou habituel reprend la main.
 *
 * Les codes produits ici sont des codes de départ, pas des codes officiels :
 * ils servent à ce que la synchronisation aboutisse. L'espace admin permet de
 * les corriger ensuite, et `sync.team_aliases` de rattraper les graphies.
 */

export interface TeamSeed {
  name: string;
  shortName: string;
  code: string;
  /** L'identifiant du fournisseur, à écrire dans `external_refs`. */
  externalId: string | null;
}

/** Mots qui ne distinguent pas un club d'un autre. */
const NOISE = new Set([
  "rugby", "club", "de", "du", "des", "la", "le", "les", "et", "sport",
  "sporting", "union", "association", "olympique", "athletic", "fc", "rc",
]);

function words(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
}

/**
 * Un code court et lisible, dérivé du nom.
 *
 * Un sigle déjà présent dans le nom (« ASM Clermont », « USAP ») vaut mieux que
 * des initiales reconstruites : c'est celui que les joueurs reconnaissent.
 */
export function deriveCode(name: string): string {
  const parts = words(name);
  if (parts.length === 0) return "EQ";

  // Un mot déjà tout en majuscules est un sigle : on le garde tel quel.
  const acronym = parts.find((w) => w.length >= 2 && w.length <= 5 && w === w.toUpperCase());
  if (acronym) return acronym;

  const meaningful = parts.filter((w) => !NOISE.has(w.toLowerCase()));
  const source = meaningful.length > 0 ? meaningful : parts;

  // Un seul mot retenu : ses premières lettres se lisent mieux qu'une initiale.
  if (source.length === 1) return source[0].slice(0, 3).toUpperCase();

  return source.map((w) => w[0]).join("").slice(0, 4).toUpperCase();
}

/** Un nom d'affichage court : le mot le plus distinctif du nom complet. */
export function deriveShortName(name: string): string {
  const parts = words(name);
  const meaningful = parts.filter((w) => !NOISE.has(w.toLowerCase()));
  const source = meaningful.length > 0 ? meaningful : parts;
  return source.slice(0, 2).join(" ") || name;
}

/**
 * Les équipes à créer, dédoublonnées et sans collision de code.
 *
 * `takenCodes` porte les codes déjà utilisés par le sport : un même code ne
 * peut pas servir deux fois, la base l'impose (`unique (sport_id, code)`).
 */
export function planTeamSeeds(
  teams: ProviderTeam[],
  takenCodes: string[] = [],
): TeamSeed[] {
  const used = new Set(takenCodes.map((c) => c.toUpperCase()));
  const seenNames = new Set<string>();
  const seeds: TeamSeed[] = [];

  for (const team of teams) {
    const name = team.name.trim();
    if (!name) continue;

    const key = name.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);

    // Une collision se règle par un suffixe numérique plutôt qu'en écartant
    // l'équipe : un club sans code n'apparaîtrait dans aucun match.
    const base = deriveCode(name);
    let code = base;
    for (let n = 2; used.has(code); n += 1) {
      code = `${base.slice(0, 3)}${n}`;
    }
    used.add(code);

    seeds.push({
      name,
      shortName: deriveShortName(name),
      code,
      externalId: team.externalId ?? null,
    });
  }

  return seeds;
}
