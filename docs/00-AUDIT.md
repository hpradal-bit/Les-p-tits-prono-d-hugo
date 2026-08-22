# 🏉 LES P'TITS PRONOS D'HUGO — Audit & architecture

> Document de cadrage. **Aucune ligne de code applicatif n'a été écrite.**
> Statut : en attente de validation par Hugo avant Phase 0.
> Dernière mise à jour : 22/08/2026.

---

## 1. Avis général

Le concept est bon, et il est bon pour une raison précise : **tu ne construis pas une
application de paris, tu construis un prétexte à chambrage**. Le produit réel n'est pas
le pronostic, c'est la conversation du lundi matin. Tout le cahier des charges doit être
relu à travers ce filtre.

Ce que ça change concrètement :

- Le moteur de scoring n'est pas le cœur du produit. C'est un **prérequis** : il doit être
  juste, transparent et incontestable, sinon le groupe se dispute et arrête. Mais personne
  ne revient dans l'app « pour l'algorithme ».
- Ce qui fait revenir : le classement qui bouge, la notification « Marco vient de te
  doubler », le résumé de journée, et la capacité à envoyer une capture d'écran dans la
  boucle WhatsApp du groupe.
- **Le vrai concurrent de ton app n'est pas Winamax. C'est le groupe WhatsApp existant.**
  Si jouer une journée prend plus de 90 secondes, les gens retournent sur WhatsApp.

Le cahier des charges est remarquablement complet — c'est rare et ça fait gagner des
semaines. Il a un seul défaut, et il est classique : **il décrit la version an 3 du produit
comme si c'était le MVP.** Le MVP listé au point 53 contient 25 éléments, dont un espace
admin « extrêmement puissant », des questions bonus, un fil social et 3 classements. C'est
4 à 6 mois de travail à temps partiel. Or ton risque n°1 n'est pas technique : c'est que
la saison 2026/27 démarre sans que l'app soit prête, ou qu'elle soit prête mais que les
copains décrochent à la 3e journée.

**Ma recommandation principale : viser un MVP jouable pour la J1 du Top 14, quitte à
tricher.** Certaines choses peuvent être faites à la main pendant 3 journées (saisir les
résultats, écrire le résumé) et automatisées après. Un produit imparfait utilisé vaut
mille fois mieux qu'un produit parfait livré en novembre.

Deuxième point important, non technique : **tu es à la fois l'administrateur et un joueur.**
L'espace admin te permet d'ajouter des points, corriger un prono, forcer un résultat. Le
jour où tu gagnes une journée de 2 points, quelqu'un le remarquera. Ce n'est pas un problème
de sécurité, c'est un problème de confiance — et il se règle par le design, pas par le code :
**journal d'administration public**, visible par tous, non modifiable. J'y reviens au point 18.

---

## 2. Les forces du concept

| Force | Pourquoi ça compte |
|---|---|
| **Groupe fermé de 6 personnes** | Tu connais tes utilisateurs. Pas d'acquisition, pas de modération, pas de RGPD lourd, pas de scaling. Techniquement, 6 utilisateurs, c'est du confort absolu : tout tient dans les offres gratuites, très largement. |
| **Le Top 14 est un sport parfait pour ça** | 14 équipes, ~7 matchs par journée, 26 journées + phases finales. Assez de matchs pour que ce soit vivant, assez peu pour qu'une journée se pronostique en 2 minutes. Le format écart de points est bien plus intéressant qu'au foot (les écarts sont larges et variés). |
| **Le scoring vainqueur / écart / score exact** | Trois niveaux de granularité = trois niveaux de prise de risque. C'est la bonne mécanique de jeu : le joueur choisit son niveau d'exposition. |
| **La règle « le score exact ne pénalise jamais »** | Excellente intuition. C'est ce qui rend le risque asymétrique et donc **jouable**. Sans ça, personne ne tente. |
| **Les tokens / super-pouvoirs** | La vraie originalité du projet. C'est ce qui te différencie de n'importe quelle app de pronos. Le DUEL est une très bonne idée (avec une réserve, voir point 15). |
| **Le refus explicite de l'esthétique casino** | Bonne direction. Le produit doit ressembler à un jeu entre potes, pas à une plateforme de paris. |
| **La règle « rien en dur »** | C'est le bon réflexe d'architecture, et c'est ce qui rendra l'app multi-sports sans réécriture. |

---

## 3. Les risques

Classés par probabilité × impact, pas par ordre d'apparition dans le cahier des charges.

### 🔴 Risque 1 — L'abandon du groupe (probabilité : élevée)

Le mode d'échec le plus courant de ce type d'app : 6 joueurs à la J1, 4 à la J3, 2 à la J6.
Causes habituelles : trop de friction pour jouer, oubli d'une journée qui met hors course,
absence de retour après le week-end.

**Antidotes à intégrer dès le MVP :**
- Une journée entière se pronostique sur **un seul écran**, en moins de 60 secondes.
- **Pronostic par défaut** : si tu n'as pas joué, le système joue pour toi (l'équipe à
  domicile, ou ton dernier choix). Tu marques peu, mais tu n'es pas éliminé du jeu.
  Désactivable, mais activé par défaut — voir point 6.
- Rappel push à H-3 s'il manque des pronos.
- Résumé de journée automatique le lundi matin, partageable en image.

### 🔴 Risque 2 — La sur-ingénierie multi-sports (probabilité : élevée)

Le cahier des charges demande une architecture multi-sports. C'est juste — mais il y a une
différence entre *« concevoir un schéma qui ne bloque pas »* (2 jours de réflexion, gratuit)
et *« construire un moteur générique multi-sports »* (2 mois, et le résultat sera mauvais
parce qu'on n'aura jamais testé un 2e sport).

**Ma position :** on conçoit le schéma de données générique (Sport → Compétition → Saison →
Journée → Match), et on écrit un moteur de scoring **par famille de sport** derrière une
interface commune. On n'écrit que la famille rugby. Le jour où on ajoute le foot, on écrit
un 2e module de 200 lignes. C'est le bon compromis coût/flexibilité.

### 🟠 Risque 3 — La dépendance aux données sportives (probabilité : moyenne, impact élevé)

Aucune API rugby gratuite n'a de garantie de service. Détail au point 8. Trois conséquences
à intégrer dès le départ :
1. **Couche d'abstraction obligatoire** (tu l'avais anticipé, c'est le bon réflexe).
2. **Saisie manuelle de secours dans l'admin** : c'est le vrai filet de sécurité. 7 matchs
   par journée, saisir 7 scores prend 2 minutes. Cette fonctionnalité doit être dans le MVP —
   elle rend l'app *indépendante* de toute API le jour où ça casse.
3. Le calendrier officiel du Top 14 2026/27 est publié tard (généralement en juin/juillet).
   Prévoir un import manuel / CSV en secours.

### 🟠 Risque 4 — Les tranches d'écart créent des injustices de bord

Avec les tranches `0-5 / 6-10 / 11-15…`, un joueur qui prédit un écart de 6 et voit un écart
de 5 perd 2 points, alors qu'un joueur qui prédit 6 et voit 10 les garde. Sur une saison, ces
effets de seuil génèrent de la frustration (« j'ai raté d'un point »).

**Alternative que je recommande de proposer en option de configuration** : le scoring par
**distance**. Le joueur annonce un écart (par ex. 8), et il marque 3 points si l'écart réel
est à ±3 de son annonce. C'est plus juste, plus simple à expliquer, et ça supprime les seuils.
On garde les tranches par défaut (c'est ce que tu as demandé, et c'est plus facile à saisir
sur mobile), mais l'architecture doit permettre de basculer — c'est une ligne de configuration.

### 🟠 Risque 5 — Admin joueur = suspicion

Traité au point 1 et au point 18. Solution : journal public et immuable.

### 🟡 Risque 6 — Les mises en pause du gratuit

Supabase met un projet gratuit en pause après 7 jours sans requête. Vercel Hobby limite les
tâches planifiées à 1 fois par jour. Ces deux limites sont contournables proprement et
gratuitement (voir points 7 et 22), mais elles doivent être traitées dès l'architecture,
pas découvertes en janvier.

### 🟡 Risque 7 — Les logos de clubs

Les logos du Top 14 sont des marques déposées. Pour un usage privé entre 6 amis, sans
publicité et sans monétisation, le risque réel est proche de zéro. Mais : ne pas rendre
l'app publique, ne pas la référencer, ne pas la monétiser. Si un jour tu veux l'ouvrir,
il faudra repasser sur des logos génériques ou demander l'autorisation. **Je te le signale,
je ne te bloque pas.**

---

## 4. Fonctionnalités prioritaires (le MVP que je recommande)

Je découpe ton MVP en deux : **MVP-1 = ce qu'il faut pour la J1**, MVP-2 = les 6 semaines
suivantes, en cours de saison.

### MVP-1 — « Jouable à la J1 » (l'objectif absolu)

| # | Fonctionnalité | Pourquoi c'est indispensable |
|---|---|---|
| 1 | Connexion par lien magique (e-mail, sans mot de passe) | Zéro friction, zéro « mot de passe oublié » à gérer |
| 2 | Profil minimal : prénom + avatar (emoji ou photo) | Identité = base du chambrage |
| 3 | Import du calendrier Top 14 26/27 (API + secours CSV/manuel) | Sans calendrier, pas de jeu |
| 4 | Écran « Ma journée » : les 7 matchs, un seul écran | Le cœur du produit |
| 5 | Prono vainqueur + écart (tranches configurables) | Le cœur du jeu |
| 6 | Score exact, mode configurable (démarrage : 1 par journée) | La prise de risque |
| 7 | Verrouillage automatique (2 h avant le coup d'envoi par défaut) | Sans ça, pas de jeu équitable |
| 8 | Récupération automatique des scores + **saisie manuelle admin** | Le filet de sécurité |
| 9 | Calcul automatique des points, recalculable à volonté | Doit être rejouable en cas de correction |
| 10 | Classement général + classement de la journée | La raison de revenir |
| 11 | Match Center : qui a pronostiqué quoi, et combien ça rapporte | Le lieu du chambrage |
| 12 | Compteur « il te reste 3 pronos » + rappel push H-3 | L'anti-abandon |
| 13 | PWA installable (icône, splash screen, hors-ligne basique) | C'est l'app |
| 14 | Admin : matchs, scores, points, verrouillage, journal public | Le contrôle |

### MVP-2 — Les 6 premières semaines de la saison

Classement forme · profils détaillés · statistiques · fil social « Le Vestiaire » ·
questions bonus (types simple/oui-non/marge) · résumé automatique de journée ·
classement réel du Top 14 · badges v1 · podium animé.

### Phase 3+

Tokens & DUEL · face-à-face · pouvoirs avancés · questions de classement · mode jour de match ·
Pro D2 · multi-sports.

---

## 5. Fonctionnalités à repousser (et pourquoi)

| Fonctionnalité | Verdict | Raison |
|---|---|---|
| **Espace admin « extrêmement puissant »** | Repousser à MVP-2/3 | Un admin complet, c'est 40 % du travail total. Pour 6 joueurs, 90 % des besoins sont couverts par 6 écrans. Le reste se fait directement en base au début. |
| **Multi-sports réel (foot, basket)** | Phase 8 | Le schéma le permettra. N'écrire aucune ligne pour le foot avant que le rugby soit rodé. |
| **Pouvoirs ESPION / ORACLE / SABOTAGE** | Phase 4+ | ESPION casse la règle du secret des pronos (point 12), qui est structurante. SABOTAGE crée du ressentiment réel dans un groupe d'amis — à manier avec précaution. |
| **Questions « joueur »** (qui marquera le plus d'essais) | Phase 5 | Nécessite des données individuelles de joueurs. Aucune API gratuite fiable ne les fournit pour le Top 14. Corriger à la main est possible, mais coûteux. |
| **Classement live temps réel pendant les matchs** | Phase 3 | Techniquement simple mais gourmand en quota. Démarrer avec une actualisation à 5 min pendant les matchs, sans websockets. |
| **Commentaires + likes + réactions complets** | MVP-2 réduit | Démarrer avec **réactions emoji seulement**. Les commentaires, le vrai groupe les fera sur WhatsApp de toute façon. |
| **Notifications e-mail** | Optionnel | Le push web suffit. L'e-mail sert uniquement à la connexion. |
| **Applications natives iOS/Android** | Non planifié | La PWA couvre 100 % du besoin d'un groupe de 6. Un compte développeur Apple coûte 99 €/an — contraire à l'objectif 0 €. |

---

## 6. Fonctionnalités supplémentaires que je propose

Par ordre de rapport valeur/effort décroissant.

### ⭐ 1. Le « prono express » (à intégrer au MVP-1)
Un seul écran, 7 cartes empilées, deux gestes par match : je tape l'équipe, je tape la
tranche d'écart. Barre de progression en haut, bouton « Valider ma journée » en bas.
Objectif chronométré : **une journée complète en moins de 60 secondes**. C'est la
fonctionnalité qui décide de la survie du produit.

### ⭐ 2. Le prono par défaut (à intégrer au MVP-1)
Au verrouillage, si un joueur n'a pas joué un match, le système applique un prono par défaut
(équipe à domicile, tranche médiane) marqué comme *automatique* et affiché comme tel (avec
une petite icône 😴 dans le Match Center — excellent matériau de chambrage). Le joueur reste
dans la course, et le classement reste comparable entre tous.
**C'est, à mon avis, la meilleure idée de ce document.** Elle supprime le principal facteur
d'abandon. Configurable par l'admin, activée par défaut.

### ⭐ 3. Le partage image (MVP-2)
Un bouton « Partager » qui génère une image (classement, résumé de journée, ton score exact)
au format story. Parce que le chambrage aura lieu sur WhatsApp, et que chaque image partagée
est un rappel gratuit pour tout le groupe. **C'est ton unique canal d'acquisition et de
rétention réel.**

### 4. Le match « confiance » (Phase 3, alternative légère aux tokens)
Chaque journée, le joueur désigne **un** match sur lequel ses points sont doublés. Gratuit,
sans token, immédiat, et ça crée un choix stratégique à chaque journée. Beaucoup plus
addictif que 2 tokens par saison, et 10× plus simple à développer que le système de pouvoirs.

### 5. Le « 5 minutes avant » (Phase 3)
Notification récapitulative juste avant le premier coup d'envoi : « Tu as misé sur Clermont,
comme Marco et Pierre. Antoine est le seul sur Toulouse. » Aucune information secrète (les
pronos sont déjà verrouillés), mais ça crée l'attente.

### 6. Le classement « saison 2 » / mi-saison (Phase 3)
Un classement qui repart à zéro à mi-saison, en plus du général. Ça relance les joueurs
décrochés en janvier. Coût : quasi nul (une date de début dans le classement).

### 7. L'écran « ce qu'il te manque pour doubler Marco » (Phase 3)
Sur la page de classement : « Il te manque 4 points. Un bon écart sur Clermont-Toulouse
suffirait. » Transforme un chiffre en objectif.

### 8. Journal d'administration public (MVP-1)
Voir points 1 et 18. Non négociable de mon point de vue.

---

## 7. La meilleure stack technique gratuite

### Ce que je recommande

| Couche | Choix | Coût | Pourquoi |
|---|---|---|---|
| **Front + back** | **Next.js 15** (App Router, TypeScript) | 0 € | Un seul projet pour le site et l'API. Écosystème énorme, PWA native, rendu rapide sur mobile. |
| **Hébergement** | **Vercel**, plan Hobby | 0 € | Déploiement automatique à chaque modification, HTTPS, CDN mondial. 100 Go de transfert/mois — tu en utiliseras ~1 %. |
| **Base de données + Auth + Stockage** | **Supabase** (PostgreSQL) | 0 € | Base relationnelle sérieuse, authentification incluse, stockage des avatars, et surtout **RLS** (sécurité au niveau des lignes) : la règle « on ne voit pas les pronos des autres avant le verrouillage » est appliquée par la base elle-même, pas seulement par l'écran. |
| **Tâches planifiées** | **Cloudflare Workers** (Cron Triggers) | 0 € | Vercel Hobby ne permet qu'**une exécution par jour**. Cloudflare permet une exécution par minute, 100 000 requêtes/jour. Un petit script qui appelle ton API de synchronisation. Règle aussi le problème de mise en veille de Supabase. |
| **Notifications** | **Web Push** (norme VAPID, bibliothèque `web-push`) | 0 € | Pas besoin de Firebase ni de OneSignal. Fonctionne sur Android et sur iOS (à condition que la PWA soit installée sur l'écran d'accueil). |
| **E-mails (connexion)** | **Resend** (SMTP personnalisé de Supabase) | 0 € | 3 000 e-mails/mois, 100/jour. ⚠️ Indispensable : le SMTP intégré de Supabase est limité à **2 e-mails par heure** — inutilisable en production, même pour 6 personnes. |
| **Images / logos** | Supabase Storage (1 Go) | 0 € | On télécharge les logos **une fois** et on les héberge nous-mêmes. On ne dépend pas de l'API pour les images. |
| **Sauvegardes** | GitHub Actions : export hebdomadaire vers un dépôt privé | 0 € | Le gratuit de Supabase n'inclut pas de sauvegarde longue durée. Indispensable : perdre une saison de pronos serait fatal. |
| **Suivi d'erreurs** | Sentry, plan gratuit | 0 € | 5 000 erreurs/mois. Optionnel mais utile. |

**Total : 0 €/mois.** Seul coût facultatif : un nom de domaine (~12 €/an), sinon
`ptits-pronos.vercel.app` fonctionne parfaitement.

### Les alternatives que j'ai écartées, et pourquoi

| Alternative | Verdict |
|---|---|
| **Cloudflare Pages + D1 (SQLite)** | Plus généreux (100 000 req/jour, pas de mise en veille), mais D1 est moins mature que PostgreSQL, il n'y a pas de RLS, et il faudrait développer l'authentification à la main. **À reconsidérer uniquement si Supabase durcit son offre gratuite.** |
| **Firebase / Firestore** | Base non relationnelle : très mauvais choix pour des classements, des agrégats et des règles de scoring. On se retrouverait à dupliquer les données partout. |
| **PocketBase / Appwrite auto-hébergés** | Nécessitent un serveur (5 €/mois minimum) — contraire à l'objectif 0 €. |
| **Neon / Turso pour la base seule** | Excellents, mais il faudrait alors ajouter séparément l'authentification et le stockage. Supabase regroupe les trois. |
| **SvelteKit / Nuxt à la place de Next.js** | Techniquement très bons. Next.js gagne sur un critère décisif dans ton cas : c'est l'écosystème le mieux documenté, donc celui où l'assistance par IA est la plus fiable. Comme tu n'es pas développeur, ce critère compte. |
| **WordPress / Bubble / no-code** | Impossible : la logique de scoring, les recalculs et les règles de visibilité dépassent ce que ces outils permettent proprement. |

### Le point de vigilance à connaître

Les conditions d'utilisation de Vercel réservent le plan Hobby à un **usage personnel et
non commercial**. Une application privée entre 6 amis, sans publicité et sans paiement,
entre dans ce cadre. **Le jour où tu voudrais monétiser quoi que ce soit, il faudra passer
au plan Pro (20 $/mois) ou migrer vers Cloudflare Pages (gratuit sans cette restriction).**
Je te le signale maintenant pour éviter la mauvaise surprise.

---

## 8. Les APIs sportives gratuites réellement disponibles (vérifié en août 2026)

J'ai vérifié les offres en ligne, pas d'après d'anciens articles. Voici l'état réel.

| Source | Coût | Couverture Top 14 | Live | Limites | Verdict |
|---|---|---|---|---|---|
| **ESPN (API non documentée)** | Gratuit, sans clé | ✅ Oui — le Top 14 a l'identifiant de ligue `270559` | ✅ Oui | Aucune limite publiée, mais **aucune garantie** : c'est une API interne, non documentée, qui peut changer ou fermer sans préavis | **Source principale recommandée pour le live et le calendrier.** Gratuite, riche, sans quota. Mais jamais en dépendance unique. |
| **API-Sports (`api-rugby`)** | Offre gratuite : **100 requêtes/jour**, remise à zéro à 00:00 UTC. Payant à partir de 10 $/mois | ✅ Top 14 couvert (à confirmer avec une clé réelle avant engagement) | ✅ Oui | 100 req/jour, quota perdu s'il n'est pas utilisé | **Source secondaire recommandée.** Contrat d'API stable et documenté. 100 req/jour suffisent largement avec une synchronisation intelligente (voir calcul ci-dessous). |
| **TheSportsDB** | Clé de démonstration gratuite (~30 req/min, **10 résultats max par appel**). Offre complète : **9 $/mois** (Patreon) — API v2, scores en direct à 2 min | ✅ Le Top 14 est référencé, avec logos et visuels | ❌ Pas en gratuit | La limite de 10 résultats rend le gratuit inutilisable pour un calendrier complet | **À utiliser une seule fois, pour récupérer les logos et visuels des 14 clubs**, puis on les héberge. Pas comme source de données vivantes. |
| **Sportradar** | Essai gratuit puis tarifs entreprise | ✅ Excellente | ✅ | Payant | ❌ Hors budget. |
| **Goalserve / Highlightly / Zyla** | Payants (abonnements mensuels) | ✅ | ✅ | Payant | ❌ Hors budget. |
| **Site officiel de la LNR (lnr.fr)** | Gratuit (extraction de pages) | ✅ Source de vérité absolue | ⚠️ | Fragile (casse à chaque refonte du site), et zone grise vis-à-vis des conditions d'utilisation | ⚠️ **Dernier recours uniquement.** Je ne le mettrais pas dans le MVP. |
| **Wikipédia / Wikidata** | Gratuit | ✅ Calendrier et résultats, mis à jour par la communauté | ❌ | Pas de temps réel, format instable | Utile comme **secours pour l'import initial du calendrier**. |

### Ma recommandation : trois sources, une seule interface

```text
              ┌──────────────────────┐
              │  SportsDataProvider  │  ← une seule interface pour l'application
              └──────────┬───────────┘
                         │
     ┌───────────────┬───┴────────────┬─────────────────┐
     ▼               ▼                ▼                 ▼
  ESPN            API-Sports      Cache en base    Saisie manuelle
 (principal)     (secours +      (dernière donnée   (admin — filet
  gratuit,       vérification)     connue)          de sécurité ultime)
  sans quota      100 req/j
```

**Règle de fonctionnement :** ESPN en premier. En cas d'échec ou d'incohérence, API-Sports.
En cas d'échec des deux, on affiche la dernière donnée connue avec la mention
« ⚠️ Dernière mise à jour il y a 7 minutes ». Et l'admin peut toujours saisir un score à la main.

### Le calcul du quota (pour prouver que 100 req/jour suffisent)

Le piège serait d'interroger l'API **une fois par match**. Il faut interroger
**une fois par journée de compétition** (l'endpoint « tous les matchs du jour pour la ligue X »
renvoie les 7 matchs en un seul appel).

| Situation | Fréquence | Requêtes/jour |
|---|---|---|
| Jour sans match | 1 appel de contrôle | 1 |
| Veille de journée (J-1) | 4 appels | 4 |
| Jour de match, hors fenêtre de match | 1 appel/heure | ~18 |
| Jour de match, pendant une fenêtre (coup d'envoi → +2 h 15) | 1 appel / 5 min | 27 par fenêtre |
| Classement réel du Top 14 | 1 appel/jour | 1 |

Un samedi de Top 14 avec deux créneaux (14h30 et 21h05) : ~1 + 18 + 54 = **73 requêtes**.
On reste sous les 100, avec de la marge. Et comme ESPN est la source principale et n'a pas
de quota, le quota d'API-Sports ne sert qu'en secours : en pratique, on consommera 5 à 10
requêtes par jour.

**⚠️ Action à faire avant de coder :** créer un compte gratuit API-Sports et vérifier avec
une vraie clé que le Top 14 saison 2026/27 est bien couvert (endpoint `/leagues?search=Top 14`),
et tester l'endpoint ESPN `site.api.espn.com/apis/site/v2/sports/rugby/270559/scoreboard`.
Je peux le faire dès que tu valides l'architecture.

---

## 9. L'architecture technique

```text
┌─────────────────────────────────────────────────────────────┐
│  PWA (Next.js) — mobile & ordinateur                        │
│  Écrans : Ma journée · Classements · Match Center ·         │
│           Vestiaire · Profil · Admin                        │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────────┐
│  Couche serveur (Next.js Server Actions + Routes API)       │
│  · Validation de toutes les entrées (côté serveur)          │
│  · Moteur de scoring (fonctions pures, rejouables)          │
│  · Moteur de règles (barèmes versionnés)                    │
│  · Générateur d'événements (feed, badges, notifications)    │
└──────┬───────────────────────────────┬──────────────────────┘
       │                               │
┌──────▼─────────────────┐   ┌─────────▼──────────────────────┐
│  Supabase              │   │  SportsDataProvider            │
│  · PostgreSQL + RLS    │   │  · ESPN (principal)            │
│  · Auth (lien magique) │   │  · API-Sports (secours)        │
│  · Storage (avatars,   │   │  · Cache base + saisie manuelle│
│    logos)              │   └────────────────────────────────┘
└────────────────────────┘
       ▲
       │ appels planifiés (secret partagé)
┌──────┴─────────────────────────────────────────────────────┐
│  Cloudflare Worker — planificateur                          │
│  · toutes les 5 min : y a-t-il un match en cours ?          │
│  · si oui → /api/sync/live                                  │
│  · 1×/jour → /api/sync/calendar + /api/sync/standings        │
│  · maintient le projet Supabase éveillé                     │
└─────────────────────────────────────────────────────────────┘
```

### Les 5 décisions d'architecture qui comptent vraiment

**1. Une table de correspondance des identifiants externes.**
Chaque équipe, chaque match a un identifiant chez ESPN, un autre chez API-Sports. On ne les
mélange jamais avec nos propres identifiants : une table `external_refs` fait la
correspondance. **C'est ce qui permet de changer d'API sans rien casser.** C'est la réponse
concrète à ta demande du point 5.

**2. Le scoring est une fonction pure et rejouable.**
`calculerPoints(pronostic, résultat, barème) → { points, détail }`. Aucune écriture directe
de points en base par un utilisateur. On peut relancer le calcul de toute la saison à tout
moment : le résultat sera identique. **C'est indispensable** parce que les API corrigent
parfois un score après coup, et parce que tu voudras ajuster le barème.

**3. Les règles sont des données versionnées, pas du code.**
Un barème (`scoring_ruleset`) est une ligne en base, en JSON, rattachée à une saison avec une
date d'effet. Changer les points ou les tranches = modifier une ligne, pas redéployer.
Et comme les barèmes sont versionnés, changer le barème en cours de saison ne réécrit pas
l'histoire, sauf si l'admin demande explicitement un recalcul.

**4. Un journal d'événements en écriture seule.**
Tout ce qui se passe (prono verrouillé, points calculés, dépassement au classement, badge
obtenu, score exact réussi) écrit une ligne dans une table `events`. Ensuite, **le fil social,
les badges et les notifications sont trois lecteurs du même flux**. Sans ça, tu écris trois
fois la même logique et elles finissent par diverger. C'est l'amélioration d'architecture
la plus rentable de ce document.

**5. La séparation live / officiel est un champ, pas deux systèmes.**
Un match a un statut (`à venir`, `en cours`, `terminé`, `officiel`). Le classement live lit
tous les matchs ; le classement officiel ne lit que les matchs `officiel`. Une seule requête,
un seul moteur, deux filtres. Pas de duplication.

---

## 10. Le schéma de base de données

Version consolidée et améliorée de ta liste du point 42.

### Identité & groupes
```text
profiles          id, prénom, pseudo, avatar_type(emoji|photo|club), avatar_valeur,
                  club_favori_id, rôle(joueur|admin), actif, créé_le
groups            id, nom, code_invitation, saison_active_id, créé_par
group_members     group_id, user_id, rôle, rejoint_le
```
> Même pour 6 amis, la notion de **groupe** doit exister dès le départ. Sinon, le jour où
> tu ouvres à un 2e groupe, il faut tout réécrire. Coût aujourd'hui : une colonne.

### Référentiel sportif (générique, multi-sports)
```text
sports              id, code(rugby|football|basket), nom, famille_scoring
competitions        id, sport_id, code(top14|prod2|ligue1), nom, pays, logo
seasons             id, competition_id, libellé(2026/2027), début, fin, statut
rounds              id, season_id, numéro, nom(J1), début, fin, statut, verrou_le
teams               id, sport_id, nom, nom_court, logo_url, couleur_1, couleur_2
season_teams        season_id, team_id            (une équipe monte, descend…)
fixtures            id, round_id, home_team_id, away_team_id, coup_denvoi,
                    statut(à_venir|en_cours|terminé|officiel|reporté),
                    score_home, score_away, minute, verrou_le,
                    source_dernier_maj, maj_le
external_refs       provider(espn|apisports|tsdb), entité(team|fixture|competition),
                    entité_id, identifiant_externe          ← la clé de l'indépendance
```

### Jeu & scoring
```text
scoring_rulesets    id, season_id, version, actif_du, actif_au, règles(JSON), créé_par
margin_buckets      ruleset_id, ordre, min, max, libellé(0-5)
predictions         id, user_id, fixture_id, issue(home|draw|away),
                    bucket_id, score_exact_home, score_exact_away,
                    est_automatique(bool), créé_le, maj_le, verrouillé_le
prediction_audit    prediction_id, ancienne_valeur, nouvelle_valeur, par_qui, quand
prediction_scores   prediction_id, points, détail(JSON: {vainqueur:1, écart:2,…}),
                    ruleset_version, calculé_le, est_officiel
point_adjustments   user_id, round_id, delta, raison, par_qui, quand   ← duels, corrections
standings_snapshots round_id, type(journée|général|forme), classement(JSON), figé_le
```
> `détail(JSON)` est important : c'est ce qui permet d'afficher **pourquoi** un joueur a
> marqué 3 points. La transparence du scoring est ce qui évite les disputes.

### Questions bonus
```text
bonus_questions     id, season_id, round_id(null=saison), type, intitulé,
                    config(JSON), barème(JSON), ouvre_le, ferme_le, statut
bonus_answers       question_id, user_id, réponse(JSON), créé_le
bonus_results       question_id, bonne_réponse(JSON), corrigé_le, corrigé_par
bonus_scores        question_id, user_id, points, détail(JSON)
```

### Gamification
```text
badges              id, code, nom, emoji, description, règle(JSON), actif
user_badges         user_id, badge_id, obtenu_le, contexte(JSON)
streaks             user_id, type, valeur_actuelle, meilleure_valeur, maj_le
tokens              id, user_id, season_id, période, statut(dispo|utilisé|expiré),
                    attribué_le, utilisé_le
powers              id, code(duel|espion|joker), nom, config(JSON), actif
power_usages        id, token_id, power_id, initiateur_id, cible_id, round_id,
                    état(déclaré|résolu|annulé), instantané_avant(JSON),
                    résultat(JSON), créé_le, résolu_le
```

### Social & notifications
```text
events              id, type, acteur_id, cible_id, round_id, fixture_id,
                    charge(JSON), créé_le          ← la source unique de vérité
feed_posts          id, event_id(null si post humain), auteur_id, texte, créé_le, masqué
reactions           post_id, user_id, emoji
comments            post_id, user_id, texte, créé_le, masqué
notifications       id, user_id, type, titre, corps, lu_le, envoyé_le
push_subscriptions  user_id, endpoint, clés(JSON), appareil, créé_le
notif_preferences   user_id, type, canal(push|in_app), actif, heures_silence
```

### Administration & exploitation
```text
admin_actions       id, admin_id, action, entité, entité_id,
                    avant(JSON), après(JSON), raison, créé_le    ← journal public
sync_runs           id, provider, type, démarré_le, fini_le, statut,
                    nb_requêtes, erreur
app_settings        clé, valeur(JSON), maj_par, maj_le           ← zéro donnée en dur
```

**Volume estimé pour une saison complète à 6 joueurs :** 26 journées × 7 matchs × 6 joueurs
= 1 092 pronostics, plus les événements et le feed. Total : **moins de 20 Mo**. La limite
gratuite de Supabase est de 500 Mo. Tu peux tenir **20 saisons**.

---

## 11. L'architecture multi-sports

Le schéma ci-dessus est déjà générique : rien n'y mentionne le rugby. Ce qui est spécifique
au sport, c'est **la façon de pronostiquer et de compter les points**. On l'isole dans un
module par famille de sport :

```text
interface FamilleSport {
  typesDePronostic()        // rugby: vainqueur+écart+score exact
                            // foot:  1N2 + score exact + buteur
                            // tennis: vainqueur + score en sets
  formulaireDeSaisie()      // le composant d'écran adapté
  calculerPoints()          // le barème de la famille
  matchNulPossible()        // rugby: rare mais oui | tennis: non | NBA: non
  formatDuScore()           // "18-10" | "3-1" | "6-4 6-3"
}
```

Ajouter le foot = écrire un module `FamilleFoot` (~200 lignes) et insérer des lignes dans
`sports` / `competitions`. **Aucune modification du schéma, aucune modification des
classements, du feed, des badges ou de l'admin.** C'est exactement ce que tu demandes au
point 47, sans le coût d'un moteur générique universel.

---

## 12. Le système de scoring

### Barème par défaut (entièrement configurable)

| Situation | Points |
|---|---|
| Mauvais vainqueur | 0 |
| Bon vainqueur | 1 |
| Bon vainqueur + bonne tranche d'écart | 3 |
| Score exact | 10 |

### La cascade (le point crucial)

Le score exact **ne remplace jamais** l'évaluation des niveaux inférieurs : il s'y ajoute par
le haut. L'algorithme évalue toujours du plus précis au moins précis et **retient le meilleur
résultat atteint** :

```text
1. Le vainqueur est-il correct ?     non → 0 point. FIN.
                                     oui ↓
2. Score exact tenté ET juste ?      oui → 10 points. FIN.
                                     non ↓
3. La tranche d'écart est-elle juste ? oui → 3 points. FIN.
                                     non ↓
4. → 1 point (bon vainqueur)
```

Quand un joueur tente un score exact, **la tranche d'écart est déduite automatiquement de
son pronostic** (16-10 → écart 6 → tranche 6-10). Il n'a rien à saisir en plus, et il ne
peut structurellement pas être pénalisé. C'est ce que garantit la règle du point 8 de ton
cahier des charges.

### Vérification sur tes quatre exemples

| Pronostic | Résultat | Analyse | Points |
|---|---|---|---|
| Clermont 16-10 | Clermont 20-14 | Vainqueur ✅ · exact ❌ · écart réel 6 → tranche 6-10 = tranche prédite ✅ | **3** |
| Clermont 16-10 | Clermont 25-20 | Vainqueur ✅ · exact ❌ · écart réel 5 → tranche 0-5 ≠ 6-10 ❌ | **1** |
| Clermont 16-10 | Toulouse 20-10 | Vainqueur ❌ | **0** |
| Clermont 16-10 | Clermont 16-10 | Vainqueur ✅ · exact ✅ | **10** |

Conforme à 100 % à ce que tu décris.

### Deux détails à trancher (je propose une réponse par défaut)

1. **Le match nul.** Rare au rugby, mais possible. Proposition : c'est une issue à part
   entière (`nul`), l'écart vaut 0, et donc la tranche `0-5`. Un joueur qui prédit « nul »
   et voit un nul touche le bon vainqueur **et** le bon écart = 3 points.
2. **Le score exact au bon écart mais mauvais score** (prono 16-10, résultat 22-16) : traité
   par la cascade → 3 points. C'est cohérent.

### Le mode « distance » (option recommandée, désactivée par défaut)

Voir le risque 4 (point 3). En mode distance, le joueur annonce un écart chiffré et marque
3 points si `|écart réel − écart annoncé| ≤ tolérance` (par défaut 3). Une ligne de
configuration dans le barème permet de basculer. Je te suggère d'essayer les tranches en
saison 1 et de comparer.

---

## 13. Le système de score exact

Tes 6 modes du point 10, avec ma lecture de chacun :

| Mode | Description | Mon avis |
|---|---|---|
| 1 | Désactivé | Utile pour tester, sans intérêt en jeu |
| 2 | Sur tous les matchs | ⚠️ Déséquilibré : celui qui tente 7 scores exacts par journée n'a aucun risque (règle de non-pénalisation) et finit par en toucher un. Ça casse le jeu. |
| 3 | **Un seul par journée** | ⭐ **Le meilleur mode, et celui que je recommande pour démarrer.** Crée un vrai choix stratégique : sur quel match je tente ? |
| 4 | Match imposé par l'admin | Bon en variante : tout le monde tente le même match, comparaison directe. |
| 5 | Le joueur choisit son match | Identique au mode 3 dans les faits |
| 6 | Plusieurs autorisés (N par journée) | Généralisation de 3 — donc c'est le mode à implémenter, avec `N=1` par défaut |

**Recommandation technique :** implémenter **un seul mécanisme** — « N scores exacts par
journée, N configurable, avec liste optionnelle de matchs imposés ». Les 6 modes deviennent
alors des réglages de ce mécanisme (mode 1 = `N:0`, mode 3 = `N:1`, mode 4 = `N:1` +
`matchs:[id]`, mode 2 = `N:tous`). Une seule logique à écrire, à tester et à maintenir.

**⚠️ Le point que je veux souligner :** le mode 2 (score exact partout), combiné à la règle
« ça ne pénalise jamais », rend le jeu dégénéré — le comportement optimal devient « je tente
toujours ». Si un jour tu veux l'activer, il faudra soit une pénalité, soit un plafond de
gains. Je te déconseille le mode 2.

---

## 14. Le système de questions bonus

### Architecture : un registre de types

Chaque type de question est un module qui expose : un formulaire de saisie, un validateur,
un correcteur, un afficheur de résultat. Ajouter un type = ajouter un module, sans toucher
au reste.

| Type | Configuration | Correction |
|---|---|---|
| `choix_unique` | liste d'options | juste / faux |
| `choix_multiple` | options, nb attendu, points par bonne réponse, malus éventuel | crédit partiel |
| `oui_non` | — | juste / faux |
| `numérique_marge` | valeur attendue, marge (±5) | dans l'intervalle = juste |
| `numérique_proximité` | valeur attendue, barème dégressif | le plus proche gagne ⭐ |
| `classement` | nb de places, liste d'équipes | bonne équipe bonne place +5 · bonne équipe mauvaise place +2 · sinon 0 |
| `équipe` | liste d'équipes | juste / faux |
| `joueur` | liste de joueurs (saisie manuelle) | juste / faux — Phase 5 |
| `texte_libre` | — | correction manuelle par l'admin |

> ⭐ **`numérique_proximité` est une amélioration que je te propose** face à `numérique_marge`.
> Avec une marge fixe, si personne n'est dans l'intervalle, personne ne marque et la question
> tombe à plat. Avec la proximité, le plus proche gagne toujours : la question reste vivante.
> Garde les deux, utilise la proximité pour les questions difficiles.

### Portée et calendrier
Une question peut être rattachée à une **saison** (« Qui gagne le Top 14 ? », posée en août,
corrigée en juin) ou à une **journée** (« Combien d'essais ce week-end ? »). Chaque question a
sa propre date d'ouverture et de fermeture, indépendantes du verrouillage des matchs.

### Ce que je mets dans le MVP-2
`choix_unique`, `oui_non`, `numérique_marge`. Ça couvre 80 % des besoins.
`classement` et `choix_multiple` en Phase 5 : leur correction partielle est la plus délicate à écrire.

---

## 15. Le système de tokens et de super-pouvoirs

### Architecture générique

```text
Token  = un droit d'usage (rattaché à un joueur, une saison, une période)
Power  = une règle de jeu (code + configuration + activable/désactivable)
Usage  = l'application d'un Power, consommant un Token, avec un instantané avant/après
```

Un pouvoir se définit par : **quand on peut le déclarer** (avant le verrouillage de la journée),
**quand il se résout** (à la clôture de la journée), **ce qu'il modifie** (des points, une
visibilité, un affichage). Ajouter un pouvoir = ajouter un module qui répond à ces trois
questions. C'est ce que tu demandes au point 37.

**Règle absolue :** un pouvoir ne modifie **jamais** les points d'un pronostic. Il écrit une
ligne dans `point_adjustments`. Ainsi, on peut toujours recalculer la saison entière et
retrouver exactement le même classement — et on peut annuler un duel sans corrompre les données.

### Le DUEL — mon analyse honnête

Le mécanisme que tu décris (le gagnant prend tout, le perdant tombe à 0 pour la journée) est
**très fort en émotion** et c'est ce qui rendra l'app mémorable. Mais il a trois défauts à
corriger avant de l'implémenter :

1. **Il n'y a aucun risque à défier le dernier du classement.** Le joueur en tête peut cibler
   le plus faible. → Correctif proposé : le défi doit être **accepté** par la cible (elle
   dépense alors *son* token aussi), ou bien la cible est **tirée au sort**, ou bien on ne
   peut défier que quelqu'un devant soi au classement. Ma préférence : **on ne peut défier
   qu'un joueur mieux classé que soi.** Simple, juste, et ça crée de la remontada.
2. **Le cas de l'égalité n'est pas défini.** → Proposition : égalité = aucun transfert, mais
   le token est consommé.
3. **Le joueur qui oublie de jouer perd automatiquement le duel.** → Réglé par le prono par
   défaut (point 6).

**Traçabilité** (tu l'avais demandée, je confirme) : initiateur, cible, journée, points de
chacun avant, résultat, points transférés, date. Un token ne peut jamais être utilisé deux
fois — contrainte d'unicité en base, pas seulement dans le code.

### Les autres pouvoirs

| Pouvoir | Mon avis |
|---|---|
| 🕵️ **ESPION** | ⚠️ Casse la règle du secret des pronos, qui est structurante (point 12 du cahier des charges). Si tu le veux vraiment : ne révéler **qu'un seul match**, et **prévenir la cible** (« Marco t'espionne »). Ça devient du jeu au lieu d'une faille. |
| 🛡️ **JOKER** (doubler les points d'un match) | ✅ Le plus simple et le plus efficace. À faire en premier, avant le DUEL. |
| 🔮 **ORACLE** (un indice) | ❓ Quel indice ? Il n'y a pas d'information cachée à révéler. Peu de valeur ; je le mettrais de côté. |
| 💣 **SABOTAGE** | ⚠️ À manier avec beaucoup de précaution : dans un groupe d'amis réel, un pouvoir qui fait perdre des points à quelqu'un d'autre génère du ressentiment, pas du rire. Si tu l'implémentes : que ce soit visible, symétrique et limité. |

---

## 16. Le système social — « Le Vestiaire »

### Le principe : un fil alimenté par les événements

Toutes les publications automatiques sont générées à partir de la table `events` (point 9,
décision 4). Une seule logique produit le fil, les notifications et les badges.

| Événement | Publication générée |
|---|---|
| Changement de leader | 👑 Hugo reprend la première place |
| Dépassement | 🔥 Marco vient de doubler Pierre |
| Score exact | 🎯 Hugo place un score exact sur Clermont-Toulouse (+10) |
| Mauvaise série | 💀 Pierre en est à 5 pronos ratés d'affilée |
| Journée terminée | 🏆 Le résumé de la J5 est disponible |
| Prono automatique | 😴 Antoine a laissé le système jouer 3 matchs pour lui |
| Action admin | ⚖️ Correction : le score de Bayonne-Pau a été rectifié |

### Ce que je recommande de couper au MVP-2
- **Réactions emoji : oui** (😂 ❤️ 🔥 👀 🤡 🏆). C'est 80 % du plaisir pour 20 % du travail.
- **Publications humaines : oui**, en texte simple.
- **Commentaires imbriqués : non.** Le vrai débat aura lieu sur WhatsApp. Une réponse à plat suffit.
- **Modération : minimale.** 6 amis. Un bouton « masquer » réservé à l'admin, tracé dans le journal.

### Le résumé automatique de journée (point 21 du cahier des charges)

Généré à partir des données réelles, avec des phrases à trous — **pas d'IA au départ**
(coût, latence, imprévisibilité). Un modèle de texte du type :

```text
🏉 JOURNÉE {n} TERMINÉE
{leader} prend la première place avec {pts} points.
{meilleur_joueur} signe la meilleure journée ({pts_j} pts).
{plus_grosse_chute} chute de la {avant}e à la {après}e place.
🎯 {n_exacts} scores exacts · 🔥 {n_vainqueurs} bons vainqueurs
📉 Le match le plus mal pronostiqué : {match} ({n} joueurs dans l'erreur)
```

Plus tard, on pourra passer par un modèle de langage pour varier le ton — mais seulement une
fois que le calcul des faits est fiable. **La donnée d'abord, le style ensuite.**

---

## 17. Le système de notifications

### Technique
Web Push standard (VAPID) : gratuit, sans service tiers. Fonctionne sur Android/Chrome et
sur iOS **à condition que la PWA soit installée sur l'écran d'accueil** (limitation d'Apple,
toujours vraie en 2026 — voir point 19). Sur ordinateur : Chrome, Edge, Firefox, Safari.

### Les notifications du MVP-1 (volontairement peu nombreuses)
1. ⏰ **H-3 avant le verrouillage**, uniquement s'il manque des pronos
2. 🏆 **Fin de journée** : « La J5 est terminée, découvre le classement »

### MVP-2
3. 🎯 Score exact réussi (à toi, et au groupe)
4. 👑 Changement de leader
5. 🔥 Dépassement direct (« Marco vient de te doubler »)
6. ❓ Nouvelle question bonus ouverte

### Trois règles anti-agacement (à coder dès le départ)
- **Regroupement** : jamais 7 notifications pour 7 matchs. Une seule, résumée.
- **Heures de silence** : rien entre 22 h et 8 h, décalé au matin.
- **Préférences par type et par canal**, avec un vrai bouton « tout couper ».

> Une notification de trop et le joueur désactive tout — et il ne les réactivera jamais.
> Mieux vaut 2 notifications utiles par semaine que 15 anecdotiques.

---

## 18. Le système d'administration

### Le principe directeur
Ne pas construire un back-office complet. Construire **les 6 écrans qui te font gagner du
temps chaque semaine**, et accepter que le reste se fasse en base pendant les premiers mois.

### MVP-1 — 6 écrans
1. **Journée** : verrouiller / rouvrir, voir qui a joué, forcer le calcul
2. **Matchs** : corriger un score, changer une heure, forcer un statut, **saisie manuelle**
3. **Barème** : points, tranches d'écart, mode du score exact, délai de verrouillage
4. **Joueurs** : ajouter, désactiver, corriger un avatar
5. **Ajustements** : ajouter/retirer des points **avec raison obligatoire**
6. **Journal** : l'historique de tout ce qui précède

### MVP-2 / Phase 3
Questions bonus · badges · tokens · modération du feed · notifications · saisons · compétitions.

### Le journal d'administration — ma recommandation la plus insistante

Toute action admin écrit une ligne **immuable** : qui, quoi, avant, après, pourquoi, quand.

```text
22/08/2026 14:32 · Hugo · Correction de score
  Bayonne-Pau : 24-17 → 24-20   Raison : erreur de l'API, score officiel LNR
  Conséquence : 2 pronostics recalculés (Marco +2, Antoine −1)
```

Et **ce journal est visible par tous les joueurs**, pas seulement par l'admin. Ça coûte
une demi-journée de développement, et ça règle définitivement le problème « l'admin joue
aussi ». Sans ça, la première correction litigieuse crée un doute qui ne partira jamais.

**Corollaire technique :** aucune action admin ne modifie directement des points. Elle écrit
une ligne dans `point_adjustments` ou corrige un résultat, puis **déclenche un recalcul**.
Le classement reste toujours reproductible à partir des données brutes.

---

## 19. Le système PWA

### Ce que ça donne concrètement
- Installable depuis Safari (iOS) et Chrome (Android) : icône sur l'écran d'accueil, pas de
  barre d'adresse, écran de démarrage
- Fonctionne hors-ligne en lecture : le classement et tes pronos restent consultables dans le métro
- Notifications push (avec la contrainte iOS ci-dessous)
- Mise à jour instantanée pour tout le monde : pas de validation par un magasin d'applications

### La contrainte iOS à connaître (vérifiée, août 2026)
Sur iPhone, **le push ne fonctionne que si la PWA a été ajoutée à l'écran d'accueil** depuis
Safari. Depuis iOS 26, tout site ajouté à l'écran d'accueil s'ouvre par défaut en mode
application, ce qui simplifie les choses — mais l'ajout reste une action manuelle.

→ **Conséquence produit :** prévoir un écran d'accueil (« Installe l'app en 3 étapes ») et
faire l'installation ensemble, en physique, lors de la soirée de lancement du groupe. C'est
le meilleur moment pour ça.

### Contenu technique
Manifeste, service worker (stratégie *stale-while-revalidate* pour les données, *cache-first*
pour les logos), icônes maskable 192/512, écrans de démarrage iOS, mode autonome, orientation
portrait, thème coloré.

### Et plus tard, une app native ?
La PWA couvre 100 % du besoin d'un groupe de 6. Si un jour tu veux publier sur les magasins :
Capacitor permet d'emballer la PWA existante en app iOS/Android **sans réécriture**. Coût :
99 €/an pour Apple, 25 € une fois pour Google. C'est pour ça qu'on garde toute la logique
côté serveur : l'app native ne serait qu'une coquille.

---

## 20. La sécurité

Avec 6 amis, la menace n'est pas le pirate anonyme. C'est **le copain malin qui ouvre les
outils de développement pour voir les pronos des autres** — ou pour se donner des points.

| Menace | Protection |
|---|---|
| Lire les pronos des autres avant le verrouillage | **RLS PostgreSQL** : la base elle-même refuse de renvoyer les lignes. Le serveur ne les envoie jamais au navigateur. Ce n'est pas un masquage à l'écran. |
| Modifier ses points | Aucune écriture de points par un utilisateur, à aucun niveau. Les points sont **calculés** côté serveur. |
| Modifier un prono après le verrouillage | Vérification côté serveur à chaque écriture : `now() < fixture.verrou_le`. L'heure du client n'est jamais utilisée. |
| Se déclarer administrateur | Le rôle est en base, jamais dans le jeton client. Vérifié côté serveur à chaque action. |
| Déclencher la synchronisation en boucle (épuiser le quota) | Route protégée par un secret partagé + limitation de débit. |
| Téléverser un fichier malveillant comme avatar | Contrôle du type MIME, taille max 2 Mo, ré-encodage systématique de l'image côté serveur, extensions autorisées en liste blanche. |
| Rejouer / spammer les API | Limitation de débit par utilisateur sur les routes d'écriture. |
| Contestation d'une action admin | Journal public immuable (point 18). |

**Trois règles non négociables :**
1. La clé de service Supabase (`service_role`) **ne quitte jamais le serveur**. Jamais dans
   le navigateur, jamais dans une variable préfixée `NEXT_PUBLIC_`.
2. **Toute** entrée est validée côté serveur (avec Zod), même si l'écran la valide déjà.
3. Les secrets vivent dans les variables d'environnement Vercel, jamais dans le dépôt Git.

---

## 21. Le coût réel estimé

### Année 1 — 6 joueurs, une saison de Top 14

| Poste | Coût |
|---|---|
| Hébergement (Vercel Hobby) | 0 € |
| Base de données + Auth + Stockage (Supabase Free) | 0 € |
| Tâches planifiées (Cloudflare Workers Free) | 0 € |
| Données sportives (ESPN + API-Sports Free) | 0 € |
| E-mails (Resend Free) | 0 € |
| Notifications push (Web Push VAPID) | 0 € |
| Suivi d'erreurs (Sentry Free) | 0 € |
| Sauvegardes (GitHub Actions) | 0 € |
| **Total récurrent** | **0 €/mois** |
| Nom de domaine (facultatif) | ~12 €/an |

### Les seuils qui déclencheraient un coût

| Déclencheur | Quand ça arriverait | Coût |
|---|---|---|
| API-Sports > 100 req/jour | Seulement si ESPN casse **et** si on synchronise mal | 10 $/mois |
| Scores en direct à 2 min via TheSportsDB | Si on veut du vrai temps réel | 9 $/mois |
| Supabase Pro | Au-delà de 500 Mo (≈ 20 saisons) ou pour supprimer la mise en veille | 25 $/mois |
| Vercel Pro | Uniquement en cas d'usage commercial | 20 $/mois |
| Resend payant | Au-delà de 100 e-mails/jour — inatteignable à 6 joueurs | 20 $/mois |

**Mon estimation honnête : 0 €/mois pendant au moins deux saisons complètes.**
Le premier euro que tu dépenseras sera pour un nom de domaine, par confort.

---

## 22. Les limites du 100 % gratuit (et comment on les contourne)

| Limite | Réalité | Contournement |
|---|---|---|
| **Supabase : mise en veille après 7 jours d'inactivité** | Le projet s'arrête, il faut le réveiller à la main | Le Cloudflare Worker le sollicite chaque jour → jamais de veille. **Résolu.** |
| **Supabase : 500 Mo, 2 projets actifs** | Tu utiliseras ~20 Mo | Non bloquant. Prévoir un projet « test » et un projet « production » = les 2 projets. |
| **Supabase : pas de sauvegarde longue durée en gratuit** | ⚠️ **Le vrai risque.** Perdre une saison de pronos | Export hebdomadaire automatique via GitHub Actions vers un dépôt privé. **À faire dès la Phase 0.** |
| **Supabase Auth : 2 e-mails/heure en SMTP intégré** | Bloquant dès le 3e joueur | SMTP personnalisé Resend → 30/heure. **Résolu, gratuit.** |
| **Vercel Hobby : 1 tâche planifiée par jour maximum** | Impossible de synchroniser toutes les 5 min | Cloudflare Worker en planificateur externe. **Résolu.** |
| **Vercel Hobby : usage non commercial** | Aucune publicité, aucun paiement | Respecté par nature. À surveiller si le projet évolue. |
| **Vercel : arrêt du service en cas de dépassement** | Pas de facture surprise, mais l'app s'arrête | À 6 joueurs, on est à ~1 % des quotas. |
| **API-Sports : 100 req/jour, perdues si inutilisées** | Suffisant (calcul au point 8) | Synchronisation intelligente + ESPN en source principale. |
| **ESPN : API non documentée, sans garantie** | ⚠️ Peut casser du jour au lendemain | Couche d'abstraction + API-Sports en secours + saisie manuelle. |
| **TheSportsDB : 10 résultats max en gratuit** | Inutilisable pour un calendrier | Utilisé une seule fois pour les logos, qu'on héberge ensuite. |
| **Aucun engagement de disponibilité sur les offres gratuites** | Une panne = l'app est hors service | Acceptable pour un jeu entre amis. Le cache permet la consultation en lecture. |
| **Démarrage à froid** | ~1 s de latence après une période d'inactivité | Imperceptible en usage réel. |

### Les trois choses à surveiller dans le temps
1. **Supabase** est l'acteur le plus susceptible de durcir son offre gratuite. Plan de repli
   préparé : Cloudflare D1 ou Neon. Comme on utilise du PostgreSQL standard, la migration
   reste faisable.
2. **ESPN** peut fermer son API interne sans préavis. Plan de repli : API-Sports.
3. **Vercel** a déjà resserré son plan Hobby par le passé. Plan de repli : Cloudflare Pages.

**Aucun de ces trois scénarios n'est bloquant, à une condition : ne jamais écrire de code
qui dépende directement d'un fournisseur.** C'est le rôle des couches d'abstraction.

---

## 23. La roadmap

| Phase | Contenu | Durée estimée | Jalon |
|---|---|---|---|
| **Phase 0** — Fondations | Schéma de base, design system, PWA vide, connexion, comptes des 6 joueurs, provider de données + import du calendrier Top 14 | 2 semaines | Les 6 comptes existent, le calendrier est en base |
| **Phase 1** — MVP jouable | Prono express, verrouillage, saisie manuelle des scores, moteur de scoring, classements journée + général, Match Center, admin minimal, journal public | 3 semaines | **Une journée test complète jouée à 6** |
| **Phase 2** — Automatisation | Synchronisation automatique ESPN + secours, classement live, push H-3 et fin de journée, prono par défaut | 1,5 semaine | Une journée se déroule sans intervention |
| **🎯 J1 DU TOP 14** | Lancement réel avec le groupe | — | **L'objectif** |
| **Phase 3** — Vie du produit | Profils, statistiques, classement forme, résumé de journée, fil Vestiaire, partage image, classement réel Top 14, podium | 3 semaines, en cours de saison | Le lundi matin devient un rendez-vous |
| **Phase 4** — Gamification | Badges, séries, animations, mode jour de match, match « confiance » | 2 semaines | Le groupe joue pour les badges |
| **Phase 5** — Tokens & pouvoirs | Moteur générique, JOKER, puis DUEL avec les correctifs du point 15 | 2 semaines | Premier duel de la saison |
| **Phase 6** — Questions bonus | Types simples, puis marge et classement, admin de correction | 2 semaines | Questions de mi-saison |
| **Phase 7** — Social avancé | Face-à-face, commentaires, résumé enrichi, alertes de classement | 2 semaines | — |
| **Phase 8** — Extension | Pro D2, puis un 2e sport (validation de l'architecture) | 2 semaines par compétition | Saison 2 |

**Chemin critique vers la J1 : environ 6 semaines et demie de travail effectif.**
Tout ce qui est en Phase 3 et au-delà se développe pendant la saison, sans bloquer le lancement.

---

## 24. Les améliorations que je recommande — récapitulatif

Par ordre d'importance.

| # | Recommandation | Impact |
|---|---|---|
| 1 | **Réduire le MVP** à 14 fonctionnalités au lieu de 25, pour être prêt à la J1 | Décisif |
| 2 | **Prono par défaut** au verrouillage : personne n'est éliminé par un oubli | Décisif — anti-abandon |
| 3 | **Prono express** : une journée entière en moins de 60 secondes | Décisif — anti-abandon |
| 4 | **Journal d'administration public** : règle le conflit admin/joueur | Décisif — confiance |
| 5 | **Saisie manuelle des scores dans l'admin dès le MVP** : indépendance vis-à-vis des API | Élevé — anti-blocage |
| 6 | **Table `events` en écriture seule** comme source unique du feed, des badges et des notifications | Élevé — architecture |
| 7 | **Table `external_refs`** : changer d'API sans rien casser | Élevé — architecture |
| 8 | **Scoring pur et rejouable + barèmes versionnés** : recalcul possible à tout moment | Élevé — fiabilité |
| 9 | **Sauvegarde hebdomadaire automatique** dès la Phase 0 | Élevé — ne jamais perdre une saison |
| 10 | **Un seul mécanisme de score exact** (N par journée) au lieu de 6 modes distincts | Moyen — simplicité |
| 11 | **Corriger le DUEL** : on ne peut défier qu'un joueur mieux classé | Moyen — équilibre du jeu |
| 12 | **Partage image** vers WhatsApp | Moyen — rétention |
| 13 | **Mode « distance »** en option, à la place des tranches d'écart | Moyen — équité |
| 14 | **Questions à proximité** plutôt qu'à marge fixe pour les questions difficiles | Faible — confort |
| 15 | **Déconseiller le mode « score exact partout »** (jeu dégénéré) | Faible — équilibre |
| 16 | **Repousser ESPION et SABOTAGE** ou les rendre visibles et symétriques | Faible — ambiance du groupe |

---

## ✅ Ce dont j'ai besoin de toi pour démarrer

1. **Valides-tu la stack ?** (Next.js + Supabase + Vercel + Cloudflare Worker)
2. **Valides-tu le MVP à 14 fonctionnalités** et l'objectif « prêt pour la J1 » ?
3. **Valides-tu le prono par défaut et le journal d'administration public ?** Ce sont mes
   deux recommandations les plus structurantes.
4. **Le score exact démarre-t-il en mode « 1 par journée » ?**
5. **Quelle est ta date cible ?** (la J1 du Top 14 2026/27 conditionne tout le planning)
6. Peux-tu me confirmer que je peux **créer les comptes gratuits** (Supabase, Vercel, Cloudflare,
   API-Sports) ou préfères-tu les créer toi-même à ton nom ? *(Je recommande : à ton nom, tu
   restes propriétaire de tout.)*

Dès que tu valides, je commence par la **Phase 0** — et je te livre d'abord le schéma de base
de données et le design system, avant toute ligne de logique métier.
