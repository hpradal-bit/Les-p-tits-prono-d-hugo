import type { PowerKind } from "./power.ts";
import { joker } from "./kinds/joker.ts";
import { duel } from "./kinds/duel.ts";
import { spy } from "./kinds/spy.ts";
import { mirror } from "./kinds/mirror.ts";
import { sabotage } from "./kinds/sabotage.ts";

const ALL: PowerKind[] = [joker, duel, spy, mirror, sabotage];
const BY_CODE = new Map(ALL.map((p) => [p.code, p]));

export function getPower(code: string): PowerKind | undefined {
  return BY_CODE.get(code);
}

export function requirePower(code: string): PowerKind {
  const p = BY_CODE.get(code);
  if (!p) throw new Error(`Pouvoir inconnu : ${code}`);
  return p;
}

export function allPowers(): PowerKind[] {
  return ALL;
}
