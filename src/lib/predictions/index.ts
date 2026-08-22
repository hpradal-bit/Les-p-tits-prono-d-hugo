/**
 * Chantier B — Pronostics & verrouillage.
 *
 * Ce qui est pur et testable (quota, verrouillage, prono par défaut) vit dans
 * des modules sans dépendance : `exact-score`, `lock`, `defaults`. Ce qui touche
 * la base vit dans `queries`, `actions` et `round-lock`.
 */

export * from "./types";
export * from "./exact-score";
export * from "./lock";
export * from "./defaults";
export * from "./schemas";
