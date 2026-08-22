# Contrats de chantier

Ce document existe pour une seule raison : **plusieurs chantiers avancent en
parallèle sur le même dépôt.** Il définit qui possède quoi. Le respecter, c'est
la différence entre gagner du temps et passer une journée à recoller des morceaux.

## Règles communes

1. **Ne modifie que les fichiers de ton périmètre.** Besoin d'un changement
   ailleurs ? Le signaler, ne pas le faire.
2. **Ne touche jamais** à `src/lib/types.ts`, `src/lib/scoring/**`,
   `src/lib/supabase/**`, `src/app/globals.css`, ni aux migrations `0001` à `0005`.
   Ce sont les fondations partagées.
3. **Nouvelle migration ?** Prends le numéro qui t'est réservé ci-dessous, jamais
   un autre. Vérifie-la avec `npm run db:verify` avant de pousser.
4. **Interface en français, code en anglais.** Composants serveur par défaut.
5. **Les points ne sont jamais écrits par un client.** Passe par le serveur.
6. **Zod sur toute entrée serveur**, même déjà validée à l'écran.
7. Avant de rendre ton travail : `npm run build` **et** `npm test` doivent passer.

## Fondations disponibles

| Élément | Où | À quoi ça sert |
|---|---|---|
| Types du domaine | `src/lib/types.ts` | `Fixture`, `Prediction`, `Ruleset`, `ScoreResult`… |
| Moteur de scoring | `src/lib/scoring/` | `computeScore()` — pure, testée, rejouable |
| Clients Supabase | `src/lib/supabase/` | `client` (navigateur), `server` (RLS), `admin` (service) |
| Barème & réglages | `src/lib/settings/` | `loadRuleset()`, `loadSettings()` |
| Primitives d'écran | `src/components/ui/` | `Card`, `Button`, `ScorePill`, `TeamLogo`, `LiveBadge` |
| Jetons de style | `src/app/globals.css` | `bg-surface`, `text-ink`, `text-wrong/winner/perfect`… |

Code couleur du jeu : 🔴 raté · 🟢 bon vainqueur · 👌 score exact. Utiliser
`ScorePill` et `LEVEL_STYLE`, ne pas réécrire les couleurs à la main.

## Répartition

| Chantier | Périmètre exclusif | Migration |
|---|---|---|
| **A · Comptes & profils** | `src/app/(auth)/**`, `src/lib/auth/**`, `src/middleware.ts` | `0010` |
| **B · Pronostics & verrouillage** | `src/app/(app)/journee/**`, `src/lib/predictions/**` | `0011` |
| **C · Données sportives** | `src/lib/providers/**`, `src/app/api/sync/**`, `worker/**` | `0012` |
| **D · Classements & Match Center** | `src/app/(app)/classement/**`, `src/app/(app)/match/**`, `src/lib/standings/**` | `0013` |
| **E · Espace admin** | `src/app/admin/**`, `src/lib/admin/**` | `0014` |
| **F · Questions bonus** | `src/app/(app)/questions/**`, `src/app/admin/questions/**`, `src/lib/bonus/**` | `0015` |
| **G · PWA & notifications** | `public/sw.js`, `src/lib/push/**`, `src/app/api/push/**`, `src/app/(app)/reglages/**` | `0016` |
| **H · Profils, stats & Vestiaire** | `src/app/(app)/profil/**`, `src/app/(app)/vestiaire/**`, `src/lib/feed/**`, `src/lib/stats/**` | `0017` |

`src/app/(app)/layout.tsx` (navigation principale) appartient au chantier **D**.
Les autres s'y raccrochent sans le modifier.

## État de la base

Les migrations `0001` à `0005` sont écrites et validées : 40 tables, politiques
RLS, Top 14 2026/2027 (14 clubs, 13 journées, 91 matchs de la phase aller).

⚠️ **Les horaires des matchs sont provisoires** (`kickoff_confirmed = false`) :
la LNR n'a pas encore publié les jours et heures. Les écrans doivent le dire, et
la synchronisation doit les corriger dès publication, en recalculant `locks_at`.
