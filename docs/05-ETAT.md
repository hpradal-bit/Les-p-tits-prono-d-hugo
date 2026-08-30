# Où on en est — 25 août 2026

Fichier de reprise. À lire en début de session, avec `CLAUDE.md` et
`docs/04-CAHIER-DES-CHARGES.md`. À tenir à jour quand l'état change.

## Coordonnées

| | |
|---|---|
| Application en ligne | https://les-p-tits-prono-d-hugo.vercel.app |
| Branche de travail | `claude/ptits-pronos-hugo-u3nry4` |
| Projet Supabase | `pronos-top14` — ref `fubgapghkagjicxmtbdy`, région eu-west-1 |
| Projet Vercel | `les-p-tits-prono-d-hugo`, équipe `hugo1-9892`, plan Hobby |
| J1 du Top 14 | samedi 5 septembre 2026 |

Les secrets ne vivent que dans les variables d'environnement Vercel et dans
`.env.local` (ignoré par git). Ne jamais les écrire ici.

## Logos, parité Pro D2, règles par sport, renommage (26 août)

- Logos des 13 clubs Pro D2 fournis par Hugo posés dans `public/logos/` et
  en base (`teams.logo_url`) ; trois clubs Pro D2 sans fichier fourni
  (Narbonne, Nissa, US Montauban) gardent le repli initiales. Logos Top 14
  et Pro D2 eux-mêmes (`competitions.logo_url`) affichés via le nouveau
  composant `CompetitionLogo` sur le catalogue de ligues, `/accueil`,
  `/ligue`, `/journee`, `/classement`.
- Le classement d'une ligue reste désormais visible même sans le moindre
  résultat (montre ses membres à 0 point) — corrigé sur `/classement`.
- Crédits accordés à parité sur « Ligue test » (Pro D2) : les pouvoirs ne
  sont pas du code par compétition (table `powers` partagée, sans
  `season_id`), il ne manquait que les jetons pour cette saison.
- `loadRulesetAt` (`src/lib/settings/index.ts`) hérite désormais du barème
  d'une autre saison du même sport quand la saison demandée n'a pas encore
  le sien — une nouvelle compétition Rugby n'aura plus besoin d'une
  migration à la main comme `0032_prod2_ruleset.sql` pour en avoir un.
- Application renommée **LE VESTIAIRE** partout (manifest, connexion,
  installeur) ; l'écran de fil social, jusqu'ici aussi appelé « Vestiaire »,
  devient **Zone de chambrage** pour ne plus confondre les deux.
- Non fait, volontairement laissé de côté (risque de migration trop élevé
  à J-10 de la J1) : un vrai `sport_id` sur `scoring_rulesets` remplaçant
  `season_id` — le repli ci-dessus couvre le besoin sans toucher au schéma.

## Performance : l'application était lente sur mobile (27 août)

Cause racine trouvée et corrigée : chaque navigation revalidait la session
Supabase **jusqu'à quatre fois en série**, chacune un aller-retour réseau
vers le serveur d'authentification — négligeable sur un poste de travail,
très sensible sur un réseau mobile (la latence, pas le débit, est le facteur
dominant).

- `src/middleware.ts` — le SEUL endroit qui revalide encore le jeton
  (`auth.getUser()`), une fois par requête. L'identité qui en ressort est
  transmise aux composants et actions serveur par un en-tête
  (`x-viewer-id`/`x-viewer-email`), écrasé à chaque requête donc infalsifiable
  par le client.
- `getViewer()` (`src/lib/auth/session.ts`) lit cet en-tête au lieu de
  revalider elle-même ; elle ne retombe sur un appel réseau que si l'en-tête
  est absent (garde-fou, chemin non couvert par le middleware).
- `(app)/layout.tsx` — sa propre vérification d'admin (un deuxième
  `auth.getUser()` + une deuxième requête `group_members`, sur **chaque**
  écran de l'application) a disparu au profit de `getViewer()`, déjà
  mémorisée pour la requête (`react.cache`) puisque la page l'appelle de
  toute façon.
- `loadJourneyBoard` (écran « Ma journée », le plus consulté) faisait sa
  propre revalidation en plus de celle de la page appelante : elle reçoit
  maintenant l'identifiant du joueur en paramètre.
- `/classement` et `/classement/reel` avaient le même défaut, corrigé pareil.

Résultat : une seule revalidation de session par navigation au lieu de deux à
quatre, sur les écrans les plus visités.

Au passage : les logos de clubs livrés par Hugo étaient bien plus grands que
nécessaire (jusqu'à 2048×2048, 955 Ko pour un logo affiché au maximum à
44 px) — `next/image` les redimensionnait déjà à la volée pour chaque
visiteur, mais chaque nouveau déploiement payait ce redimensionnement à
froid sur les 31 fichiers. Recompressés à 240 px de côté maximum (large
marge au-delà de tout affichage réel, y compris les écrans à forte densité) :
`public/logos/` passe de 4 Mo à 445 Ko, aucune perte visible.

Pas touché dans cette passe (periodicité moindre, ou déjà correct) :
`requireAdmin()`/`getViewerContext()` de l'espace admin
(`src/lib/admin/auth.ts`) revalide encore la session à chaque écran/action —
moins visité que le jeu, laissé de côté pour ne pas élargir le risque
juste avant J-9.

## Réglages admin par ligue, questions bonus dupliquées, déconnexion (27 août)

- **Bug majeur corrigé** : tous les écrans `/admin/*` (bareme, joueurs,
  pouvoirs, badges) restaient câblés sur `currentSeasonId()` — une fonction
  qui ne renvoyait que l'unique saison flaguée `status='active'` (le Top 14).
  Changer un paramètre (ex. quota de score exact) pour la Pro D2 n'avait donc
  aucun effet, silencieusement réécrit sur le Top 14. `currentSeasonId()`
  est **supprimée** ; chaque écran résout désormais explicitement sa ligue
  (`?league=<id>`, sélecteur si plusieurs) puis sa saison via
  `loadActiveSeason`, comme `/journee`/`/classement` déjà. A aussi révélé
  deux bugs d'intégrité de points, corrigés au passage : `declarePower`
  vérifiait le solde de jetons de la mauvaise saison, et
  `resolveRoundPowers` écrivait les ajustements de points d'un pouvoir sur
  la mauvaise saison à la clôture — les deux dérivent maintenant la saison
  du `rounds.season_id` de la journée réellement concernée, jamais d'une
  « saison courante ».
- Questions bonus (`bonus_questions`) même chantier : `createBonusQuestion`
  prend désormais une ligue explicite ; `admin/bonus` et `/questions` ont un
  sélecteur de ligue. Les deux questions Top 14 ouvertes ont été dupliquées
  pour « Ligue test » (Pro D2) avec les vraies équipes Pro D2.
- Logos complémentaires reçus d'Hugo : Montauban, Narbonne, Nice posés.
- **Bouton de déconnexion** ajouté directement sur `/reglages` (existait déjà
  au fond de `/mon-compte`, pas assez visible). A révélé un bug préexistant
  (introduit avant cette session, jamais déclenché) : `src/lib/push/
  preferences-actions.ts`, marqué `"use server"`, exportait une constante
  d'objet en plus de sa fonction — interdit par Next.js pour un module
  `"use server"`, ce qui faisait planter **toute** action postée depuis
  `/reglages`. Constante et type déplacés dans `preferences-state.ts`,
  fichier normal. Corrigé et vérifié (tsc/build/526 tests OK).

## Ligues privées (26 août, en cours — plan complet dans `/root/.claude/plans/purrfect-snuggling-backus.md`)

Chantier lancé à la demande d'Hugo : de vraies ligues privées indépendantes,
plusieurs par compétition, chacune avec ses membres, sa clé, son classement,
son espace d'administration. Cinq incréments livrés ; la suite est
identifiée mais pas encore faite.

**Livré :**
- Tables `leagues`/`league_members` (migration `0033_leagues.sql`).
- RLS resserrée sur les deux politiques les plus sensibles : `profiles_read`
  et `predictions_read` (après verrouillage) ne s'ouvrent plus à « tout le
  groupe », mais aux seuls coéquipiers d'une ligue commune
  (`shares_any_league`, `shares_league_for_fixture`).
- Les deux ligues réelles existent : « Prono des copains » (Top 14, clé
  `COPAINS`) et « Ligue test » (Pro D2, clé `PRODTEST`) — mêmes membres,
  mêmes rôles qu'avant, aucune perte de données.
- Catalogue décoratif (football, basketball, tennis, cyclisme + compétitions,
  `is_active=false`) pour l'écran « Rejoindre une ligue ».
- Parcours complet : `/accueil`, `/ligues/rejoindre`,
  `/ligues/rejoindre/[competitionCode]`, `/ligues/creer`, `(app)/ligue`
  (« Ma ligue » — infos, clé, membres, édition réservée à l'administrateur
  de CETTE ligue). Redirection après connexion adaptée
  (`src/app/page.tsx`) : sans ligue → accueil, une seule → dedans
  directement, plusieurs → accueil pour choisir.
- `src/lib/leagues/*` : lecture, écriture (rejoindre/créer/modifier/
  régénérer la clé/gérer les membres), génération de clé pure et testée.
- **(3ᵉ incrément, 26 août)** `/journee`, `/classement`, `/regles`,
  `/match/[id]`, `/match/[id]/points`, `/profil` et `/profil/[id]` sont
  passés de `?ligue=top14|prod2` (code de compétition en dur) à
  `?league=<id>` (identifiant de ligue) — le pont temporaire noté plus bas
  a disparu. `loadJourneyBoard`, `loadActiveSeason`, `loadMatchCenter`
  prennent désormais une ligue, jamais une compétition par défaut.
  `loadStandingsData` — et donc le classement, l'historique et les fiches
  joueurs — ne lit plus `profiles.is_active=true` globalement mais les
  membres de la ligue affichée (`league_members`) : c'était un vrai bug,
  pas seulement un manque de cloisonnement — avant ce correctif, le
  classement d'une ligue montrait déjà tous les joueurs actifs de
  l'application, toutes ligues confondues. `round_participation` (SQL,
  migration `0034_league_scoped_journey.sql`) joint maintenant
  `league_members` au lieu de `group_members`. Nouvel helper
  `resolveLeagueId` (`src/lib/leagues/queries.ts`) centralise « quelle
  ligue afficher, sinon rediriger vers `/accueil` » sur tous ces écrans.
  Au passage, deux bugs préexistants corrigés : `regles/page.tsx` et
  `match/[id]/points/page.tsx` retombaient sur le Top 14 par défaut
  (`loadActiveSeason(sb)` sans argument) ; `classement/top14/page.tsx`
  (renommé `classement/reel/page.tsx`) était pareillement figé sur le
  Top 14 quelle que soit la ligue affichée.
- **(4ᵉ incrément, 26 août)** RLS resserrée sur les cinq dernières tables
  encore assises sur `is_member()` : `user_badges`, `streaks`, `tokens`,
  `power_usages`, `bonus_scores` (migration
  `0035_league_scoped_gamification.sql`). Sans nouvelle colonne : ces tables
  se rattachent toutes à une saison (directement, ou via `round_id`/
  `question_id`), et une saison ne porte aujourd'hui qu'une seule ligue — les
  fonctions `league_of_season`/`league_of_round` la retrouvent par cette
  route, à revoir avec `resolveLeagueForSeason` (TypeScript) le jour où une
  compétition héberge plusieurs ligues. Sans risque pour l'usage actuel :
  toutes les lectures applicatives de ces tables passent déjà par le client
  de service (RLS contournée), sauf `bonus_scores` dans `loadStandingsData`,
  où le joueur consulte toujours une ligue dont il est membre.
- **(5ᵉ incrément, 26 août)** Le Vestiaire (`/vestiaire`) est cloisonné par
  ligue — décision explicite d'Hugo : un fil par ligue, avec sélecteur si
  plusieurs, plutôt qu'un fil commun. `feed_posts.group_id` (jamais lu par
  les RLS jusqu'ici) est repointé vers `league_id` (migration
  `0036_league_scoped_feed.sql`) ; `reactions`/`comments` sont désormais
  vérifiées par jointure sur `feed_posts.league_id`. Les deux messages déjà
  publiés basculent vers la ligue historique « Prono des copains », là où
  ils ont réellement été écrits — un mot du Vestiaire n'ayant par nature
  aucun lien avec une saison, il n'existait aucune autre façon de les
  rattacher à une ligue précise. `loadFeed`, `publishPost` et
  `loadLastDebrief` prennent désormais une ligue ; ce dernier corrige au
  passage un bug préexistant (`seasons.status='active'` globalement, plutôt
  que la saison de la ligue affichée). Note de sécurité corrigée en même
  temps : `feed_posts_insert`/`reactions_write`/`comments_write` ne
  vérifiaient jusqu'ici que l'auteur, jamais son appartenance au fil visé.

**Décision de séquencement (documentée dans le plan, à relire avant de
continuer) :** l'inscription reste fermée au code général existant. Ouvrir
l'inscription à une clé de ligue à de vrais inconnus est un chantier séparé,
volontairement reporté après que le cloisonnement soit prouvé solide.

**Pas encore fait (périmètre du plan, non commencé) :**
- `saveStandingsSnapshot`/badges/séries à la clôture de journée
  (`settle.ts`, `badges/actions.ts`) : calculent désormais leurs standings
  pour LA ligue d'une compétition (`resolveLeagueForSeason`), mais restent
  écrits à des clés partagées par compétition
  (`standings_snapshots(season_id, round_id, kind)`, `user_badges`,
  `streaks`) — correct tant qu'une compétition n'a qu'une seule ligue
  (vrai aujourd'hui), à refaire avec une colonne `league_id` le jour où
  deux ligues partagent une compétition.
- Crédits/pouvoirs (`tokens`/`power_usages`, `src/lib/powers/*`) : la
  lecture est cloisonnée par ligue depuis la migration `0035` (RLS), mais la
  distribution et la consommation des crédits restent pensées par saison
  entière côté application, pas par ligue.

## Base de données

42 tables (dont `leagues`/`league_members`), RLS active partout. Migrations
appliquées jusqu'à **0036**.

⚠️ Le 26 août, les migrations 0023 à 0030 n'étaient en réalité **jamais
appliquées** en base malgré ce que ce fichier annonçait — un bug de la 0026
(`c.slug` au lieu de `c.code`, et un `on conflict` mal ciblé sur
`external_refs`) bloquait la chaîne depuis la Pro D2. Corrigé et rejoué en
base ce jour-là ; `scripts/verify-migrations.sh` confirme maintenant que
0001 → 0031 s'appliquent proprement de bout en bout sur une base neuve.

Remplies : `teams` (14), `fixtures` (182), `rounds` (26), `powers` (5),
`badges` (6), `app_settings` (52), `profiles` (1). Depuis le 26 août, la
**Pro D2** existe aussi (`competitions.code = 'prod2'`, saison `2026/2027`
en statut `draft` — volontairement, elle ne doit pas devenir « la » saison
active). Identifiant de saison : `648c2e2f-88a7-46f0-b687-7010b0fb944a`.

**Vides, et c'est ce qui bloque le jeu :**

| Table | Conséquence |
|---|---|
| `tokens` | personne n'a de crédit, aucun pouvoir activable |
| ~~`user_badges`~~ | ✅ attribués à la clôture de journée via `awardRoundBadges` |
| ~~`streaks`~~ | ✅ mis à jour à la clôture de journée via `persistRoundStreaks` |
| ~~`notification_preferences`~~ | ✅ écran joueur dans **Réglages**, un interrupteur par type |
| `standings_snapshots` | se remplira à la première clôture de journée |

## Fait

- Rebranding **VESTIAIRE** — « Des potes, des pronos, du kiff »
- Ma journée : salutation, compte à rebours, sections À jouer / Verrouillés /
  En cours / Terminés, bandeau de navigation entre journées
- Classement : graphe d'évolution (SVG, sans dépendance), pastilles de forme
- Vestiaire : débrief de journée, fil social, filtres
- Questions bonus : 4 types, registre extensible, réglage automatique
- Synchronisation : 4 fournisseurs en chaîne, jamais de saisie manuelle
- Pouvoirs : 5 implémentés (Joker, Duel, Espion, Oracle, Sabotage), résolus à
  la clôture, avec coût en crédits paramétrable depuis l'admin
- Badges : 6 badges seed (machine, en_feu, sniper, spirale, patron, remontada),
  moteur pur, registre de règles extensible (streak/count/superlative), attribués
  automatiquement à la clôture de journée dans `settleRound`
- Séries : `streaks` mise à jour à la clôture, cache reconstruit intégralement
- **Pro D2 comme banc d'essai (§5-8 en partie)** : `loadActiveSeason`,
  `loadJourneyBoard` et `loadRounds` filtrent maintenant par **code de
  compétition** plutôt que par statut « active » — deux compétitions peuvent
  donc vivre en même temps sans se marcher dessus. Bulles Top 14 / Pro D2 sur
  `/journee`, `/classement` et `/admin/matchs`. La clôture de journée
  (`settleRound`) dérive la saison de la journée elle-même (plus de
  `currentSeasonId`), pour ne pas attribuer badges/séries/instantané de
  classement à la mauvaise compétition. Le Worker Cloudflare peut synchroniser
  des saisons supplémentaires en direct via `EXTRA_SYNC_SEASON_IDS`
  (`worker/wrangler.toml`) — posé sur la Pro D2 pour le banc d'essai, à vider
  une fois le Top 14 lancé.
  ⚠️ Corrigé le 26 août : cliquer sur un match Pro D2 depuis `/journee`
  renvoyait un **404**. La bulle changeait bien de compétition sur la liste,
  mais chaque lien qui en sortait (une carte de match, le sélecteur de
  journée, l'envoi d'un prono, le retour depuis le Match Center) oubliait le
  paramètre `?ligue=`, donc retombait sur le Top 14 par défaut — la page du
  prono cherchait alors un match Pro D2 dans la mauvaise saison et ne le
  trouvait pas. `MatchCard`, `RoundNav`, `PronoForm` et `loadMatchCenter`
  portent maintenant tous la compétition d'un bout à l'autre.
  Reste non traité : `groups.active_season_id` (singulier, inutilisé par ce
  chantier), et les pouvoirs/crédits (`powers/actions.ts`) qui continuent de
  lire « la » saison active — sans conséquence tant qu'aucun pouvoir n'est
  activé sur une journée Pro D2.

## Système de crédits (migration 0031)

Le coût vit dans `powers.config.credit_cost`, jamais dans le code. Lecture
centralisée dans `src/lib/powers/credits.ts`.

Joker 5 · Duel 8 · Espion 3 · Oracle 4 · Sabotage 6 — modifiables dans
**Admin → Pouvoirs**.

Le coût est figé dans `power_usages.snapshot_before.creditCost` à la
déclaration : rééquilibrer un pouvoir ne réécrit pas les parties jouées.

## À faire ensuite

1. ~~**Badges**~~ — ✅ fait. Moteur pur dans `src/lib/badges/engine.ts`,
   registre extensible dans `rules.ts`, câblé dans `settleRound`. 16 tests.
2. ~~**Séries**~~ — ✅ fait. Persistance dans `src/lib/stats/persist.ts`,
   appelée à la clôture dans `settleRound`. 4 tests ajoutés.
3. ~~**Notifications**~~ — ✅ fait. Écran joueur dans **Réglages** : un
   interrupteur par type de notification, écrit dans `notification_preferences`
   sous RLS (`notif_prefs_own`), jamais avec la clé de service. La fusion
   catalogue × choix vit dans une fonction pure partagée,
   `src/lib/push/preferences.ts`, utilisée **à la fois** par l'écran et par
   `enqueue` — corrige au passage une divergence : `notify.ts` traitait une
   ligne absente comme un « oui » implicite et ignorait `default_enabled`, si
   bien qu'un type ajouté « éteint par défaut » se serait affiché coupé tout en
   partant quand même. 13 tests.
Rien d'autre en attente pour l'instant. Deux chantiers envisagés ont été
abandonnés le 26 août, à la demande d'Hugo : le grisage des pouvoirs
« Coming soon » (§36), et la suite du multi-ligue (relation groupe ↔
plusieurs saisons, écran « Mes compétitions », pouvoirs/crédits scopés par
compétition). La Pro D2 en banc d'essai (voir « Fait » ci-dessus) reste en
place telle quelle.

## Pour tester la Pro D2 avant jeudi

0. ⚠️ Corrigé le 26 août : la synchro Pro D2 échouait entièrement (TheSportsDB
   et Highlightly écartés faute de `THESPORTSDB_KEY`/`HIGHLIGHTLY_KEY` dans
   Vercel, ESPN en 400 faute de référence Pro D2, API-Sports sans référence).
   TheSportsDB retombe maintenant sur la clé partagée « 123 » (gratuite, sans
   inscription) quand `THESPORTSDB_KEY` n'est pas réglée — c'était déjà prévu
   dans son code, mais le registre des fournisseurs (`registry.ts`) l'écartait
   de la chaîne avant de lui laisser sa chance. Une clé dédiée reste possible
   plus tard (Patreon 3 $/mois) pour ne plus dépendre du quota partagé.
0bis. ⚠️ Corrigé le 26 août : `/journee?ligue=prod2` plantait en 500 —
   « Aucun barème pour la saison … ». La saison Pro D2 (créée par la
   migration 0025) n'avait jamais reçu de `scoring_rulesets` ni de
   `margin_buckets` : ces tables sont scopées par saison, jamais partagées.
   Migration 0032 : copie du barème du Top 14 en vigueur (même cascade de
   score, mêmes 9 tranches d'écart) vers la Pro D2. Réglable ensuite comme
   n'importe quelle saison depuis Admin → Barème.
   Calendrier Pro D2 : la synchro n'a rapporté que 15 matchs / 2 journées
   (J1 le 27 août, J2 le 3 septembre) en une seule requête — la fenêtre
   demandée couvrait toute la saison (400 jours), donc ce n'est pas une
   troncature de notre côté : TheSportsDB n'a, pour l'instant, pas publié
   plus loin pour cette ligue. Le calendrier se complètera de lui-même à
   la synchro quotidienne suivante, sans action à faire.
   `HIGHLIGHTLY_KEY` posée dans Vercel le 26 août (clé RapidAPI personnelle,
   offre gratuite 100 req/jour) : Highlightly est actif en second recours,
   derrière TheSportsDB. La chaîne tient maintenant à deux fournisseurs
   indépendants avant de retomber sur ESPN puis API-Sports.
1. **Admin → Synchronisation** : choisir « Pro D2 » dans le sélecteur de
   compétition, lancer « Synchroniser le calendrier » puis « Relever les
   scores » une première fois à la main pour vérifier que la chaîne répond.
2. Aller sur `/journee?ligue=prod2` (bulle Pro D2) pour pronostiquer.
3. Pendant le match, le Worker synchronise automatiquement (cadence de 5-10
   min) grâce à `EXTRA_SYNC_SEASON_IDS` posé dans `worker/wrangler.toml` — pas
   besoin de cliquer à la main, sauf pour vérifier plus tôt que prévu.
4. Une fois un match terminé, ses points se calculent seuls (recalcul déclenché
   par la synchro live, comme au Top 14) : vérifier sur `/journee?ligue=prod2`
   et `/classement?ligue=prod2`.
5. Une fois **tous** les matchs d'une journée terminés, clôturer depuis
   **Admin → Matchs** (bulle Pro D2) pour vérifier badges, séries et
   instantané de classement.

## Points ouverts

Aucun pour l'instant.

- ~~**Clé secrète Supabase à faire tourner.**~~ ✅ fait le 26 août. Nouvelle
  clé `sb_secret_...` créée dans Supabase, posée dans Vercel
  (`SUPABASE_SERVICE_ROLE_KEY`), redéployée, anciennes clés supprimées.
  Vérifié après coup : 403 requêtes servies en 200, zéro erreur — la
  production tourne avec la nouvelle clé.
- ~~**Distribuer des crédits**~~ ✅ fait le 26 août depuis Admin → Pouvoirs.

## Pièges déjà rencontrés

- Les tests utilisent le lanceur natif de Node (`node --test
  --experimental-strip-types`), **pas vitest**. Un `import { describe } from
  "vitest"` fait échouer le typecheck, donc `next build`, donc le déploiement
  Vercel — sans message clair. Toujours `node:test` + `node:assert/strict`, et
  l'extension `.ts` sur les imports relatifs.
- Le fichier `src/lib/powers/kinds/mirror.ts` exporte le code **`oracle`**, qui
  est celui présent en base. Un test verrouille cette correspondance.
- `next dev` réécrit un bloc dans `CLAUDE.md` à chaque lancement. Le commettre
  avec le reste plutôt que d'essayer de l'enlever.
