/**
 * Qui est administrateur.
 *
 * Le rôle n'est jamais saisi par le joueur ni déduit d'un ordre d'arrivée : il
 * est déclaré côté serveur, dans la variable d'environnement ADMIN_EMAILS
 * (adresses séparées par des virgules). Conséquences voulues :
 *
 *   · personne ne peut se promouvoir en bidouillant le formulaire ;
 *   · Hugo n'a aucune requête SQL à lancer après son inscription ;
 *   · si un copain s'inscrit avant lui, ça ne change rien.
 *
 * Ce fichier est volontairement séparé de `actions.ts` : un module « use server »
 * ne peut exporter que des fonctions asynchrones.
 */
export function isAdminEmail(email: string): boolean {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}
