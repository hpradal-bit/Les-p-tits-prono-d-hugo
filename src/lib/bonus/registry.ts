import type { ErasedKind } from "./kind.ts";
import { yesNo } from "./kinds/yes-no.ts";
import { singleChoice } from "./kinds/single-choice.ts";
import { numericClosest } from "./kinds/numeric-closest.ts";

const ALL_KINDS: ErasedKind[] = [yesNo, singleChoice, numericClosest];

const BY_KIND = new Map(ALL_KINDS.map((k) => [k.kind, k]));

export function getKind(kind: string): ErasedKind | undefined {
  return BY_KIND.get(kind);
}

export function requireKind(kind: string): ErasedKind {
  const k = BY_KIND.get(kind);
  if (!k) throw new Error(`Type de question inconnu : ${kind}`);
  return k;
}

export function allKinds(): ErasedKind[] {
  return ALL_KINDS;
}
