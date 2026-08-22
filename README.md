# 🏉 Les p'tits pronos d'Hugo

Application privée de pronostics sportifs entre amis.
Démarrage : **Rugby → Top 14 → saison 2026/2027**, avec une architecture prévue
dès le départ pour accueillir d'autres compétitions et d'autres sports.

## État du projet

**Phase : cadrage.** Aucune ligne de code applicatif n'a encore été écrite —
l'architecture et le périmètre du MVP sont en attente de validation.

## Documents

| Document | Contenu |
|---|---|
| [`docs/00-AUDIT.md`](docs/00-AUDIT.md) | Audit complet : avis, risques, stack technique gratuite, APIs sportives vérifiées, architecture, schéma de base de données, scoring, tokens, sécurité, coûts, roadmap |

## Principes retenus

- **0 €/mois** au démarrage : uniquement des offres gratuites, vérifiées et documentées.
- **Aucune donnée en dur** : joueurs, équipes, barèmes, tranches, badges, délais — tout est configurable.
- **Aucune dépendance directe à une API** : couche d'abstraction + secours + saisie manuelle.
- **Scoring rejouable** : le classement doit toujours être recalculable à l'identique.
- **Journal d'administration public** : toute action d'admin est tracée et visible de tous.
