/** Concatène des classes en ignorant les valeurs vides. */
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
