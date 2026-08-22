# Les p'tits pronos d'Hugo — consignes de développement

Application privée de pronostics sportifs entre amis. Rugby / Top 14 / saison 2026-2027.
Lire `docs/00-AUDIT.md` avant toute décision d'architecture.

## Contexte

- **6 joueurs**, groupe fermé. Pas de mise à l'échelle à prévoir.
- **J1 du Top 14 : samedi 5 septembre 2026.** Vagues 0 et 1 livrées une semaine avant.
- Budget : **0 €/mois**. Aucune dépendance payante sans validation explicite.

## Stack

Next.js (App Router, TypeScript) · Supabase (PostgreSQL + Auth + Storage + RLS) ·
Vercel (Hobby) · Cloudflare Worker (planificateur de synchronisation) ·
Web Push VAPID · Resend (SMTP de Supabase).

## Règles non négociables

1. **Aucune donnée métier en dur.** Barèmes, tranches d'écart, délais de verrouillage,
   couleurs, badges, quotas de score exact : tout vit dans `scoring_rulesets`,
   `margin_buckets` ou `app_settings`, et se modifie depuis l'espace admin.
2. **Les points ne sont jamais écrits par un client.** Ils sont calculés côté serveur
   par une fonction pure et rejouable : `computeScore(prediction, result, ruleset)`.
   Relancer le calcul d'une saison entière doit redonner exactement le même résultat.
3. **Le secret des pronostics est appliqué par la base**, via RLS — jamais seulement à
   l'écran. Un pronostic d'autrui n'est lisible qu'après `fixtures.locks_at`.
4. **La clé `service_role` de Supabase ne quitte jamais le serveur.** Jamais dans une
   variable `NEXT_PUBLIC_*`.
5. **Aucune dépendance directe à un fournisseur de données.** Tout passe par
   `SportsDataProvider` ; la correspondance des identifiants vit dans `external_refs`.
6. **Toute action d'administration écrit dans `admin_actions`**, avec une raison.
   Cette table est immuable : pas de politique UPDATE ni DELETE, même pour l'admin.
7. **Toute entrée est validée côté serveur avec Zod**, même si l'écran la valide déjà.
8. **Les événements de jeu écrivent dans `events`.** Le fil social, les badges et les
   notifications lisent ce flux ; ils ne recalculent jamais la logique de leur côté.

## Base de données

Migrations dans `supabase/migrations/`, appliquées dans l'ordre. Ne jamais modifier une
migration déjà appliquée : en ajouter une nouvelle.

## Scoring — la cascade

Évaluer du plus précis au moins précis, retenir le meilleur niveau atteint :

1. Mauvais vainqueur → 0
2. Score exact tenté **et** juste → 10
3. Bonne tranche d'écart → 3
4. Bon vainqueur seul → 1

La tranche d'écart d'un score exact est **déduite** du pronostic : tenter un score exact
ne peut jamais faire perdre de points. C'est une règle produit, pas une optimisation.

## Conventions

- Identifiants de code et de base en anglais (`fixtures`, `predictions`), interface et
  commentaires en français.
- Composants serveur par défaut ; `"use client"` uniquement quand c'est nécessaire.
- Pas de bibliothèque de composants : le design system du projet, en Tailwind.
