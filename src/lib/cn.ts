/**
 * Concatène des classes en ignorant les valeurs vides.
 *
 * ⚠️ Concatène seulement : aucune fusion Tailwind. `cn("h-24", "h-14")` rend
 * bien les deux classes, et c'est l'ordre des règles dans la feuille de style
 * qui tranche — pas l'ordre des arguments. Une valeur par défaut posée dans un
 * composant peut donc écraser en silence celle que l'appelant lui passe.
 *
 * La règle qui en découle : un composant ne fixe jamais par défaut une
 * propriété que ses appelants peuvent vouloir changer (hauteur, rayon,
 * largeur). Il la leur laisse entièrement.
 */
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
