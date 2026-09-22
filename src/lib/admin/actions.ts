/**
 * Actions de l'espace admin — barrel de réexport.
 *
 * Découpé par domaine (audit technique, tâche « Split admin/actions.ts »,
 * ce fichier faisait 1846 lignes) en `./actions/{matches,scoring,players,
 * push,sync}.ts`. Pur déplacement de code, aucun changement de comportement
 * ni de signature : les ~19 fichiers qui importent depuis `@/lib/admin/actions`
 * continuent de fonctionner sans modification.
 *
 * Deux règles tenues dans chaque module, sans exception :
 *   · aucune action n'écrit directement des points — elle corrige une donnée
 *     puis déclenche un recalcul ;
 *   · toute action écrit dans `admin_actions` avec une raison.
 */

export * from "./actions/matches";
export * from "./actions/scoring";
export * from "./actions/players";
export * from "./actions/push";
export * from "./actions/sync";
