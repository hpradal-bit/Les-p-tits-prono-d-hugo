# Cahier des charges — refonte du 25 août 2026

Prompt intégral fourni par Hugo, conservé **verbatim** pour servir de source de
vérité. Ne pas le réécrire : quand une décision de produit est contestée, c'est
ce texte qui tranche.

Les sections les plus structurantes pour le développement en cours :

| § | Sujet |
|---|---|
| 2 | Performance — priorité élevée |
| 8 | Sport / compétition : ne pas coder en dur le Top 14 |
| 19 | Onglets à venir / en cours / terminés |
| 20-21 | Règles du jeu et barème, paramétrables par ligue |
| 29-30 | Super-pouvoirs : priorité très élevée, design des cartes |
| 31-35 | Exemples de pouvoirs (X2, Espion, Miroir, Défi) |
| 36 | Pouvoirs « Coming soon » |
| 37-39 | Crédits, suivi admin, historique |
| 40-41 | Le Vestiaire |

---

Ok, code moi tout d’un coup sans interruption comme ça on essaye que l’appli soit prête demain pour aussi faire le teste avec le prod2

Mission — Refonte, accélération et développement de l’application « Vestiaire »

0. CONTEXTE IMPORTANT — À LIRE AVANT DE COMMENCER

Tu travailles sur une application de pronostics sportifs déjà développée.

L’application fonctionne déjà et plusieurs fonctionnalités existent. Ne repars donc pas de zéro et ne casse pas ce qui fonctionne.

Je veux maintenant faire une grosse phase de développement et de finition.

Objectif principal

Je ne veux pas que tu penses uniquement à une petite application utilisée par quelques amis.

Je veux que tu construises une architecture capable de passer demain à une véritable application grand public, potentiellement avec :

* plusieurs milliers puis dizaines de milliers d’utilisateurs ;
* plusieurs sports ;
* plusieurs compétitions ;
* plusieurs ligues par utilisateur ;
* plusieurs groupes d’amis ;
* plusieurs saisons ;
* un système de pronostics configurable ;
* des super-pouvoirs ;
* des notifications ;
* des classements ;
* des statistiques ;
* des données sportives importées automatiquement.

Aujourd’hui, l’objectif est principalement le rugby et le Top 14, mais l’architecture doit être pensée dès maintenant pour pouvoir ajouter facilement la Pro D2, puis le football, le tennis, etc.

Je veux éviter au maximum d’avoir à refaire l’architecture lorsque l’application grandira.

⸻

1. MÉTHODE DE TRAVAIL — TRÈS IMPORTANT

J’ai actuellement un budget limité de crédits sur Claude Code.

Je suis déjà à environ 30 % d’utilisation et mon quota se renouvelle dimanche à 17 h.

Je veux donc que tu sois très efficace et que tu évites de perdre des crédits sur des discussions inutiles ou des micro-ajustements.

Avant de coder

Commence par :

1. analyser rapidement l’architecture actuelle ;
2. identifier la stack utilisée ;
3. identifier Supabase, Vercel, APIs, base de données, authentification, stockage, etc. ;
4. comprendre les principales tables et relations ;
5. identifier les fonctionnalités déjà existantes ;
6. identifier les éventuels problèmes de performance ;
7. identifier ce qui doit être conservé ;
8. identifier ce qui doit être refactorisé ;
9. identifier les risques techniques liés au passage à plusieurs sports/compétitions/ligues.

Ensuite

Présente-moi un plan d’action court et priorisé.

Pas besoin de me faire un rapport de 50 pages.

Je veux quelque chose comme :

P0 — Architecture / performance / données
P1 — Fonctionnalités essentielles
P2 — UX / design
P3 — Super-pouvoirs
P4 — Fonctionnalités secondaires / Coming Soon

Puis commence rapidement l’implémentation.

Règle importante

Ne me demande pas confirmation pour chaque petit choix de design ou de développement.

Lorsque le choix est évident, prends une décision professionnelle et avance.

Si un choix risque réellement de modifier l’architecture ou le produit, explique-moi brièvement le problème et propose la meilleure solution.

⸻

2. PERFORMANCE — PRIORITÉ ÉLEVÉE

L’application est actuellement trop lente.

Je veux que tu analyses précisément pourquoi.

Objectif :

rendre l’application aussi rapide et fluide que possible, avec une sensation quasiment instantanée.

Analyse notamment :

* appels Supabase inutiles ;
* requêtes trop nombreuses ;
* requêtes séquentielles qui pourraient être parallélisées ;
* données rechargées inutilement ;
* composants React qui se rerendent inutilement ;
* absence de cache ;
* absence de données préchargées ;
* images trop lourdes ;
* appels API sportifs ;
* calculs réalisés côté client alors qu’ils pourraient être réalisés côté serveur ;
* problèmes de structure de base de données ;
* indexes Supabase/PostgreSQL ;
* RLS trop coûteuses ;
* appels répétés lors de la navigation ;
* chargements de pages ;
* données qui pourraient être mises en cache.

Je veux une vraie analyse de performance et pas simplement ajouter des loaders.

UX souhaitée

L’utilisateur doit avoir l’impression que :

* l’application répond immédiatement ;
* les écrans sont déjà prêts ;
* les données importantes sont préchargées ;
* les interactions sont fluides ;
* les changements de pronostics sont instantanés.

⸻

3. HÉBERGEMENT ET SCALABILITÉ

Analyse également l’hébergement actuel.

Je veux savoir si l’architecture actuelle :

* est adaptée à une petite ligue entre amis ;
* peut supporter une montée en charge ;
* peut supporter plusieurs milliers d’utilisateurs ;
* peut évoluer vers une application publique.

Je veux que tu vérifies également si l’hébergement actuel est suffisant.

Si une solution gratuite ou quasiment gratuite permet d’améliorer l’application, privilégie-la.

Si une solution payante est nécessaire, privilégie une solution dont le coût reste extrêmement faible au début.

Ne mets pas en place une infrastructure coûteuse sans nécessité.

L’objectif est :

architecture scalable dès maintenant, coût minimal aujourd’hui.

⸻

4. NOUVELLE ARCHITECTURE PRODUIT — TRÈS IMPORTANT

L’application ne doit plus être pensée comme :

« une ligue de potes qui joue au Top 14 ».

Elle doit être pensée comme :

une plateforme de pronostics permettant à un utilisateur de rejoindre et gérer plusieurs compétitions et plusieurs ligues.

⸻

5. MES COMPÉTITIONS

Ajouter une notion de :

« Mes compétitions »

L’utilisateur doit pouvoir retrouver toutes les compétitions auxquelles il participe.

Exemple :

Mes compétitions

Rugby

* Top 14
* Pro D2

Football

* Ligue 1
* Ligue des Champions

Tennis

* Roland-Garros
* Wimbledon

Etc.

L’architecture doit permettre d’ajouter facilement de nouvelles compétitions.

⸻

6. LIGUES

Un utilisateur doit pouvoir appartenir à plusieurs ligues.

Exemple :

Hugo peut avoir :

* Ligue « Les copains »
* Ligue « Famille »
* Ligue « Boulot »
* Ligue « Rugby »
* etc.

Le nombre de ligues doit être potentiellement illimité.

Chaque ligue possède notamment :

* ses joueurs ;
* son sport ;
* sa compétition ;
* sa saison ;
* ses règles ;
* son barème ;
* ses super-pouvoirs ;
* ses crédits ;
* ses notifications ;
* son classement.

⸻

7. INVITATION PAR CODE

Chaque ligue doit disposer d’un code court d’invitation.

Exemple :

A7K92F

L’administrateur peut transmettre ce code à ses amis.

Un utilisateur peut alors :

1. ouvrir « Rejoindre une ligue » ;
2. entrer le code ;
3. rejoindre la ligue.

Prévoir également la possibilité de générer un nouveau code si nécessaire.

Le système doit être sécurisé.

⸻

8. SPORT / COMPÉTITION

La structure doit être générique.

Exemple :

Sport : Rugby

→ Compétition : Top 14

ou

→ Compétition : Pro D2

Demain :

Sport : Football

→ Ligue 1

→ Premier League

etc.

Ne hardcode donc pas le Top 14 dans toute l’application.

Le Top 14 doit être une compétition parmi d’autres.

⸻

9. IDENTITÉ DE L’APPLICATION

Le nom pourrait devenir :

VESTIAIRE

Le slogan envisagé :

Des potes, des pronos, du kiff.

Autres variantes possibles :

Des potes, des pronos, du sport, du kiff.

Pour l’instant, utilise VESTIAIRE et le slogan principal, mais rends ces éléments facilement modifiables.

L’identité doit être :

* sportive ;
* sociale ;
* premium ;
* moderne ;
* amusante ;
* compétitive ;
* suffisamment sérieuse pour pouvoir devenir une vraie application grand public.

⸻

10. MA JOURNÉE — REFONTE

10.1 Ton prono

La zone « Ton prono » n’est actuellement pas suffisamment visible.

Je veux la rendre beaucoup plus importante visuellement.

Lorsque je pronostique une équipe :

État sélectionné

L’équipe sélectionnée doit être clairement identifiable.

Par exemple :

* équipe non sélectionnée → état normal ;
* équipe sélectionnée → fond gris / état sélectionné ;
* pronostic gagné → vert ;
* pronostic perdu → rouge.

Le design exact est libre, mais il doit être immédiatement compréhensible.

⸻

11. PRONOSTIC DIRECTEMENT SUR LA PAGE

C’est un point très important.

Je ne veux plus :

cliquer sur le match → ouvrir une page → faire le pronostic → revenir en arrière → recommencer.

Je veux :

tout faire directement depuis « Ma journée ».

Exemple :

Toulouse

Montpellier

Je sélectionne :

Toulouse

Alors seulement apparaissent :

* écart de points ;
* score exact ;
* éventuelles options supplémentaires.

Tant que je n’ai pas sélectionné d’équipe, les options avancées peuvent rester masquées.

Objectif :

maximum d’informations visibles + minimum de clics.

Chaque clic inutile doit être supprimé lorsque cela est possible.

⸻

12. ÉCART DE POINTS

Une fois l’équipe sélectionnée, afficher directement les tranches.

Exemple :

* 1–5
* 6–10
* 11–15
* 16–20
* etc.

Les tranches doivent être configurables dans l’administration.

⸻

13. SCORE EXACT

Prévoir directement sur la carte du match une possibilité de sélectionner/saisir le score exact.

Je veux quelque chose de simple et rapide.

Par exemple :

[ Toulouse ] [ 27 ] – [ 18 ]

ou une interface équivalente plus élégante.

Pas de page supplémentaire.

⸻

14. POINTS GAGNÉS

Une fois le pronostic terminé, afficher clairement le nombre de points gagnés.

Exemple :

0 point ❌

1 point 👍

3 points 🎯

10 points 🏆

Le design doit être très visuel, intuitif et satisfaisant.

L’utilisateur doit immédiatement comprendre :

« J’ai gagné X points sur ce match. »

⸻

15. BADGES À CÔTÉ DE « TERMINÉ »

À côté de « Terminé », prévoir une zone avec plusieurs indicateurs :

Bon

Bonne équipe pronostiquée.

Perfect

Bon écart de points.

Score exact

Score exact trouvé.

Ces éléments doivent être visuels et immédiatement compréhensibles.

⸻

16. NOMBRE DE MATCHS

La carte :

7 matchs · Horaires provisoires

doit afficher :

* nombre de matchs à venir dans la journée ;
* nombre de pronostics restant à effectuer.

Exemple :

7 matchs · 4 pronos restants

⸻

17. PROCHAIN VERROUILLAGE

Au lieu de :

Verrou : sam. 13:00

afficher un compte à rebours dynamique.

Exemple :

Prochain match dans 2 h 17 min

Puis :

1 h 59 min

etc.

Le compte à rebours doit être dynamique.

⸻

18. NAVIGATION ENTRE LES JOURNÉES

Entre les informations générales et les matchs, ajouter un bandeau :

J1 | J2 | J3 | J4 | J5 | J6 | J7…

Le design doit être :

* très lisible ;
* rapide ;
* intuitif ;
* facilement scrollable si beaucoup de journées.

⸻

19. MATCHS À VENIR / EN COURS / TERMINÉS

En haut de « Ma journée », créer des onglets :

Matchs à venir

Onglet par défaut.

Matchs en cours

Matchs terminés

Bonus

Les matchs à venir doivent pouvoir afficher tous les matchs jusqu’à la fin de la saison, afin de permettre de pronostiquer à l’avance.

Afficher éventuellement des compteurs :

En cours · 6

Terminés · 66

À venir · 57

À toi de choisir le meilleur design.

⸻

20. RÈGLES DU JEU

Remplacer :

« Comment on joue ? »

par :

Règles du jeu

Cette rubrique doit expliquer simplement :

1. choisir l’équipe gagnante ou le match nul ;
2. choisir l’écart de points ;
3. éventuellement choisir le score exact ;
4. expliquer le barème.

Barème par défaut :

* mauvaise équipe → 0 point
* bonne équipe → 1 point
* bon écart → 3 points
* score exact → 10 points

Mais absolument tout doit être paramétrable.

⸻

21. RÈGLES PARAMÉTRABLES PAR LIGUE

Chaque ligue doit pouvoir définir ses propres règles.

Paramètres potentiels :

* nombre de points pour bonne équipe ;
* nombre de points pour bon écart ;
* nombre de points pour score exact ;
* tranches d’écart ;
* score exact activé/désactivé ;
* fréquence des bonus ;
* nombre de super-pouvoirs ;
* nombre de crédits ;
* etc.

Prévoir également des paramètres par défaut globaux dans l’administration.

Une nouvelle ligue peut donc récupérer les paramètres par défaut puis les modifier.

⸻

22. FRÉQUENCE DES FONCTIONNALITÉS

Prévoir une architecture permettant de configurer certaines fonctionnalités :

* par journée ;
* par mois ;
* par saison ;
* une seule fois ;
* etc.

Ne pas hardcoder ces règles.

⸻

23. CLASSEMENT

Onglet par défaut

Le premier onglet doit être :

Classement général

C’est également l’onglet affiché par défaut.

⸻

24. FORME DU MOMENT

Sur la droite, afficher la forme récente du joueur avec des pastilles :

🟢

🔴

🟢

🟢

🔴

etc.

À rendre visuel et élégant.

⸻

25. HISTORIQUE DU CLASSEMENT

Je veux une véritable visualisation graphique de l’évolution du classement.

Axe horizontal

Les journées :

J1 → J2 → J3 → J4 → J5 → etc.

Axe vertical

Les points cumulés.

Chaque joueur doit avoir :

* une ligne ;
* son avatar ;
* une évolution au fil des journées.

Exemple :

Hugo :

J1 → 10 points
J2 → 12 points
J3 → 15 points
J4 → 20 points

Marco :

J1 → 5 points
J2 → 8 points
J3 → 15 points
J4 → 22 points

On doit visuellement voir :

* les joueurs monter ;
* les joueurs descendre ;
* les dépassements ;
* les écarts ;
* les évolutions.

L’objectif est d’avoir une visualisation très dynamique, avec éventuellement une animation lors du passage d’une journée à l’autre.

Chaque joueur doit être identifiable par son avatar.

Le graphique doit rester lisible même avec beaucoup de joueurs.

⸻

26. CLASSEMENT LIVE

Conserver l’onglet :

Live

Il doit calculer le classement en temps réel selon :

* les résultats des matchs ;
* les pronostics ;
* les points déjà obtenus ;
* les matchs restants.

⸻

27. CLASSEMENT OFFICIEL

À côté de Live, créer :

Officiel

Il doit afficher par défaut le classement de la journée précédente.

Exemple :

Nous jouons la J6.

→ Officiel affiche :

Classement J5

Lorsque nous jouons J7 :

→ Officiel affiche :

Classement J6

L’utilisateur doit pouvoir cliquer sur l’historique et consulter :

* J1 ;
* J2 ;
* J3 ;
* J4 ;
* J5 ;
* etc.

⸻

28. VRAI CLASSEMENT DU TOP 14

Supprimer l’ancien onglet du classement qui permettait d’accéder au classement réel du Top 14.

Créer à la place un encart indépendant, beaucoup plus esthétique.

Il doit donner envie de cliquer dessus.

Utiliser le logo officiel du Top 14 si disponible.

En cliquant dessus :

Classement Top 14

Créer une véritable interface dédiée avec :

* classement complet ;
* points ;
* matchs joués ;
* victoires ;
* défaites ;
* bonus ;
* différence de points ;
* résultats ;
* historique par journée ;
* matchs ;
* statistiques utiles.

Cette partie doit pouvoir évoluer vers une véritable mini-interface de consultation du Top 14.

Et surtout :

ne pas hardcoder cette fonctionnalité de manière à empêcher son utilisation pour la Pro D2 ou d’autres compétitions.

⸻

29. PROFIL — SUPER-POUVOIRS

PRIORITÉ TRÈS ÉLEVÉE

Les super-pouvoirs sont l’une des fonctionnalités les plus importantes de l’application.

Je veux qu’ils deviennent un véritable élément différenciant par rapport aux autres applications de pronostics.

Il faut donc particulièrement soigner :

* UX ;
* design ;
* animations ;
* compréhension ;
* règles ;
* système de crédits ;
* historique ;
* équilibre du jeu.

⸻

30. DESIGN DES SUPER-POUVOIRS

Utiliser l’esprit du composant Cascade existant dans le barème.

Chaque super-pouvoir doit être présenté sous forme de carte/bulle :

Gauche

Avatar / logo du super-pouvoir.

Centre

* nom ;
* description ;
* effet ;
* comment l’utiliser ;
* règles.

Droite

Coût en crédits.

En dessous :

Il vous reste 5 crédits

⸻

31. EXEMPLE — SUPER-POUVOIR X2

Nom :

X2

Description :

Double les points obtenus pendant la journée sélectionnée.

Coût :

5 crédits

Exemple :

Si je marque 8 points :

→ avec X2 : 16 points

Afficher clairement :

5 crédits utilisés

5 crédits restants

⸻

32. EXEMPLE — ESPION

Nom :

Espion

Description :

Permet de consulter les pronostics d’un autre joueur sur une journée donnée.

Exemple :

Je sélectionne :

Marco

Je peux alors voir ses pronostics.

Le système doit respecter les règles de verrouillage de la journée.

Une fois la journée verrouillée, les pronostics ne doivent évidemment plus pouvoir être modifiés.

⸻

33. EXEMPLE — MIROIR

Nom :

Miroir

Description :

Reproduit automatiquement les pronostics d’un autre joueur.

Exemple :

Je sélectionne :

Antoine

Le système copie ses pronostics.

Cela peut notamment être stratégique lorsqu’un joueur veut éviter qu’un autre le dépasse au classement.

⸻

34. EXEMPLE — DÉFI

Nom :

Défi

Je lance un défi à :

Fonta

Si je marque plus de points que Fonta :

→ je récupère mes points + ses points.

Fonta :

→ 0 point.

Si Fonta marque plus de points que moi :

→ Fonta récupère ses points + mes points.

Ce super-pouvoir doit être pensé avec soin afin d’éviter les abus.

⸻

35. AUTRES SUPER-POUVOIRS

Tu dois également proposer plusieurs autres idées de super-pouvoirs.

Je veux que tu réfléchisses comme un game designer.

Les super-pouvoirs doivent :

* être amusants ;
* créer de la stratégie ;
* créer du chambrage ;
* donner envie de revenir ;
* ne pas rendre le jeu injuste ;
* avoir des coûts différents ;
* être équilibrables.

Propose plusieurs idées mais n’en implémente pas automatiquement 25.

Commence par une sélection cohérente d’environ 5 super-pouvoirs.

Les autres peuvent être affichés :

COMING SOON

⸻

36. SUPER-POUVOIRS « COMING SOON »

J’aime beaucoup le système actuel qui permet de griser les fonctionnalités à venir.

Je veux exactement le même principe pour les super-pouvoirs.

Exemple :

🔒 Saboteur

COMING SOON

🔒 Joker

COMING SOON

🔒 Prédiction secrète

COMING SOON

L’utilisateur doit comprendre :

cette fonctionnalité arrivera bientôt.

Cela permet de montrer immédiatement que l’application va continuer à évoluer.

⸻

37. CRÉDITS

Dans l’administration :

Créer un paramètre :

Crédits attribués par joueur

Exemple :

10 crédits

Tous les joueurs commencent avec le même nombre.

Ce nombre doit être configurable.

⸻

38. ADMIN — SUIVI DES CRÉDITS

L’administrateur doit pouvoir voir :

Joueur	Crédits restants	Super-pouvoirs utilisés
Hugo	5	X2
Marco	2	Espion
Antoine	10	Aucun

Mais également garder un historique définitif.

Exemple :

Marco a utilisé Espion contre Antoine — J6 — 24/08/2026

Hugo a utilisé X2 — J6 — 24/08/2026

Pierre a utilisé Défi contre Marco — J5 — 20/08/2026

Ces événements doivent rester enregistrés.

⸻

39. HISTORIQUE DES SUPER-POUVOIRS

Un super-pouvoir utilisé ne doit pas simplement disparaître.

Il doit être enregistré dans la base de données.

Prévoir notamment :

* utilisateur ;
* super-pouvoir ;
* cible éventuelle ;
* journée ;
* date ;
* coût ;
* résultat ;
* éventuels points gagnés/perdus.

Cela servira également au Vestiaire.

⸻

40. LE VESTIAIRE

Le Vestiaire doit devenir le fil social de l’application.

Un endroit où l’utilisateur peut voir tout ce qui s’est passé.

Je veux un flux mélangeant :

* résultats ;
* super-pouvoirs ;
* événements ;
* classements ;
* débriefings ;
* actualités sportives.

⸻

41. FIL DU VESTIAIRE

Exemples :

🕵️ Marco a utilisé Espion contre Antoine.

🏆 Hugo prend la première place !

📈 Marco dépasse Antoine au classement.

🏉 Toulouse s’impose 28–21 contre Montpellier.

🔥 Hugo marque 15 points lors de la J6.

Tout doit être présenté sous forme de cartes/bulles élégantes.

⸻

42. FILTRES DU VESTIAIRE

Prévoir :

Tout

Tout le flux.

Top 14

Uniquement les informations sportives.

Ligue

Uniquement les événements liés à la ligue.

Super-pouvoirs

Uniquement les super-pouvoirs utilisés.

Cela permet d’avoir :

une vue générale

ou

une vue spécialisée.

⸻

43. DÉBRIEFING DU TOP 14

Créer un bloc :

Débriefing Top 14

Contenu potentiel :

* résultats importants ;
* grosses performances ;
* changements au classement ;
* équipes en forme ;
* grosses surprises ;
* informations importantes.

⸻

44. DÉBRIEFING DE LA LIGUE

Créer un bloc :

Débriefing de la ligue

Exemples :

Marco dépasse Antoine.

Antoine dégringole de 3 places.

Hugo prend la première place.

Pierre réalise la meilleure journée.

Marco est le joueur qui a gagné le plus de points cette journée.

⸻

45. NOTIFICATION DU DÉBRIEFING

Prévoir la possibilité d’envoyer le résumé de la journée en notification push.

Exemple :

🏉 Débrief de la J6 disponible !

Hugo prend la première place et Marco réalise la meilleure remontée.

⸻

46. NOTIFICATIONS — NOUVELLE LOGIQUE

Important :

Par défaut, toutes les notifications doivent être ACTIVÉES.

Je veux que l’application vive.

Je ne veux pas cacher les notifications.

Par défaut :

* notifications activées ;
* messages activés ;
* notifications sportives activées ;
* notifications de ligue activées ;
* notifications liées aux super-pouvoirs activées.

⸻

47. PARAMÈTRES DE NOTIFICATIONS

Prévoir néanmoins un réglage discret permettant à l’utilisateur de choisir :

* toutes les notifications ;
* notifications réduites ;
* plage horaire ;
* heures de sommeil ;
* éventuellement certaines catégories.

Mais ce réglage doit rester secondaire et discret dans l’UX.

L’objectif est :

par défaut, l’application doit être vivante et envoyer les notifications utiles.

⸻

48. AVATAR

Actuellement, si je choisis le logo ASM, je vois seulement :

ASM

Je veux que l’avatar soit beaucoup plus visible.

Augmenter la taille des pastilles.

L’avatar doit être visible :

* classement ;
* profil ;
* Ma journée ;
* Vestiaire ;
* ligues ;
* historique ;
* événements ;
* etc.

⸻

49. AVATAR COMME RACCOURCI

Cliquer sur mon avatar doit pouvoir être un raccourci vers :

Mon profil

Cela peut devenir un élément de navigation global.

⸻

50. DESIGN GLOBAL

L’application doit avoir une sensation :

* premium ;
* moderne ;
* sportive ;
* sociale ;
* fluide ;
* robuste ;
* professionnelle.

Éviter absolument :

* aspect cheap ;
* typographies vieillissantes ;
* éléments trop petits ;
* interfaces surchargées ;
* trop de clics ;
* écrans inutiles ;
* navigation compliquée.

Je veux une application qui donne envie de l’utiliser.

⸻

51. ESPACE ADMIN

Lorsque l’utilisateur est dans l’administration :

le bandeau de navigation principal de l’application ne doit plus apparaître.

L’administration doit disposer de sa propre navigation.

Il faut cependant pouvoir revenir facilement à l’application principale.

Corriger le bug actuel qui empêche parfois de revenir correctement.

⸻

52. ADMIN — MATCHS

Conserver une interface de gestion manuelle des matchs.

Mais cette interface est uniquement un mode secours.

Normalement :

* matchs importés automatiquement ;
* horaires importés automatiquement ;
* résultats importés automatiquement ;
* scores importés automatiquement ;
* classement recalculé automatiquement ;
* points recalculés automatiquement.

⸻

53. ADMIN — BARÈME

Dans l’onglet Barème, le composant Cascade existant est intéressant.

Utiliser ce principe visuel pour les super-pouvoirs.

Même logique :

Logo | Explication | Coût

Et possibilité de modifier les paramètres.

⸻

54. ADMIN — TRANCHES D’ÉCART

Lorsque l’administrateur modifie une tranche d’écart, il faut lui demander/préciser :

Cette modification s’applique-t-elle :

À toute la saison

ou

À partir de maintenant

Même logique que pour les autres paramètres temporels.

⸻

55. ADMIN — NOTIFICATIONS

La fonctionnalité :

« ÉCRIRE AU GROUPE »

ne fonctionne actuellement pas correctement.

Je peux écrire :

* un titre ;
* un message ;

puis envoyer.

Mais la notification n’arrive pas.

Il faut :

1. vérifier le système ;
2. vérifier les permissions ;
3. vérifier le stockage des notifications ;
4. vérifier le système push ;
5. vérifier que les destinataires sont correctement ciblés ;
6. corriger le problème ;
7. tester réellement l’envoi.

⸻

56. ADMIN — GARDE-FOU

Le garde-fou doit être configurable.

Mais surtout :

Par défaut

DÉSACTIVÉ

Pourquoi ?

Parce que je veux que tous les joueurs reçoivent les notifications par défaut.

Chaque joueur pourra ensuite choisir ses propres paramètres.

Prévoir :

* activation/désactivation ;
* horaires ;
* préférences individuelles.

Et permettre à l’administrateur de définir les règles générales de la ligue.

⸻

57. DONNÉES SPORTIVES

Le système doit être pensé pour recevoir automatiquement :

* matchs ;
* dates ;
* horaires ;
* résultats ;
* scores ;
* classements ;
* statistiques.

Le système doit être capable d’associer les données sportives à :

Sport → Compétition → Saison → Journée → Match

⸻

58. EXEMPLE D’ARCHITECTURE

Je veux que tu réfléchisses à une structure proche de :

Sport

→ Rugby

Compétition

→ Top 14
→ Pro D2

Saison

→ 2026/2027

Journée

→ J1
→ J2
→ J3

Match

→ Toulouse vs Montpellier

Ligue

→ Les potes de Hugo

Joueurs

→ Hugo
→ Marco
→ Antoine

Pronostics

→ pronostics des joueurs

Points

→ calculés selon les règles de la ligue

Super-pouvoirs

→ utilisés par les joueurs

Cette structure est indicative : adapte-la à l’architecture technique actuelle si nécessaire.

⸻

59. PRÉPARATION À L’OUVERTURE AU GRAND PUBLIC

Je veux que tu réfléchisses dès maintenant à une éventuelle ouverture au grand public.

Objectif possible :

Coupe du Monde de Rugby 2027

L’application pourrait être lancée au public avant cet événement.

Donc pense dès maintenant à :

* performance ;
* scalabilité ;
* sécurité ;
* authentification ;
* base de données ;
* cache ;
* coûts ;
* architecture multi-tenant ;
* séparation des ligues ;
* permissions ;
* RLS ;
* stockage ;
* APIs sportives ;
* notifications ;
* logs ;
* monitoring.

Mais ne construis pas une usine à gaz maintenant.

Je veux :

architecture propre + évolutive + simple + peu coûteuse.

⸻

60. PRIORISATION

Pour éviter de gaspiller du temps et des crédits, priorise dans cet ordre :

PRIORITÉ 0 — Architecture / performance

* audit ;
* vitesse ;
* requêtes ;
* base de données ;
* architecture multi-sports ;
* architecture multi-compétitions ;
* architecture multi-ligues ;
* scalabilité.

PRIORITÉ 1 — Expérience de jeu

* Ma journée ;
* pronostics directement sur la page ;
* journées ;
* verrouillage ;
* compte à rebours ;
* matchs à venir/en cours/terminés ;
* points ;
* classement ;
* classement live/officiel.

PRIORITÉ 2 — Super-pouvoirs

* système de crédits ;
* 5 super-pouvoirs ;
* historique ;
* administration ;
* UX ;
* Vestiaire ;
* Coming Soon.

PRIORITÉ 3 — Social

* Vestiaire ;
* débriefing ;
* notifications ;
* messages.

PRIORITÉ 4 — Compétitions

* Mes compétitions ;
* Top 14 ;
* Pro D2 ;
* architecture permettant d’ajouter d’autres sports.

PRIORITÉ 5 — Design / finition

* typographie ;
* animations ;
* avatars ;
* micro-interactions ;
* polish général.

⸻

61. RÈGLE ABSOLUE DE DÉVELOPPEMENT

À chaque fonctionnalité, pose-toi ces questions :

1.

Est-ce que l’utilisateur peut faire la même chose avec moins de clics ?

2.

Est-ce que l’interface peut être plus rapide ?

3.

Est-ce que l’information importante est immédiatement visible ?

4.

Est-ce que cette fonctionnalité fonctionnera encore avec 10 000 utilisateurs ?

5.

Est-ce que cette fonctionnalité fonctionne si demain on ajoute un autre sport ?

6.

Est-ce que cette fonctionnalité fonctionne avec plusieurs ligues ?

7.

Est-ce que cette fonctionnalité est suffisamment premium ?

8.

Est-ce que cette fonctionnalité peut être paramétrée par l’administrateur lorsqu’elle doit l’être ?

⸻

62. IMPORTANT — NE PAS SUR-DÉVELOPPER

Je veux une application ambitieuse mais je ne veux pas perdre mes crédits à développer des fonctionnalités secondaires alors que les fonctionnalités principales ne sont pas terminées.

Donc :

ne passe pas 30 minutes à perfectionner une animation si une fonctionnalité essentielle n’est pas terminée.

Priorité au fonctionnel.

Puis UX.

Puis design.

Puis animations/polish.

⸻

63. TESTS

Après chaque grosse modification :

* vérifier que l’application démarre ;
* vérifier qu’il n’y a pas d’erreurs console ;
* vérifier les principales pages ;
* vérifier les interactions ;
* vérifier les données ;
* vérifier les permissions ;
* vérifier que les fonctionnalités existantes continuent à fonctionner.

Ne casse pas une fonctionnalité existante pour en développer une nouvelle.

⸻

64. LIVRABLE ATTENDU

À la fin de cette phase, je veux avoir :

Une application :

* rapide ;
* moderne ;
* premium ;
* fluide ;
* intuitive ;
* pensée mobile ;
* pensée pour plusieurs ligues ;
* pensée pour plusieurs compétitions ;
* pensée pour plusieurs sports ;
* avec un système de pronostics configurable ;
* avec des classements ;
* avec un vrai système de super-pouvoirs ;
* avec des crédits ;
* avec un historique ;
* avec un Vestiaire social ;
* avec des notifications ;
* avec une architecture évolutive.

⸻

65. DERNIÈRE CONSIGNE

Ne te contente pas d’appliquer mécaniquement mes demandes.

Je veux que tu sois force de proposition.

Si tu identifies :

* une meilleure UX ;
* une meilleure architecture ;
* une meilleure façon de gérer les données ;
* une meilleure façon de gérer les super-pouvoirs ;
* un problème de sécurité ;
* un problème de performance ;
* un problème de scalabilité ;
* une idée qui rendrait l’application plus addictive/sociale ;

propose-la et, si c’est une amélioration évidente et sans risque, implémente-la directement.

Pour les super-pouvoirs en particulier :

réfléchis comme un game designer et propose-moi des idées originales.

Je veux que cette fonctionnalité soit l’un des gros éléments différenciants de Vestiaire.

Mais reste pragmatique :

on construit d’abord une excellente V1, puis on enrichira progressivement l’application.

Commence maintenant par auditer rapidement le projet existant, puis donne-moi un plan d’action priorisé et court, et commence immédiatement par les priorités les plus importantes sans perdre de temps sur des détails secondaires.