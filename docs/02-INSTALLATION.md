# Mise en ligne — la marche à suivre

Trois étapes, dans cet ordre. Compter 20 minutes.

---

## 1. Créer la base de données

1. Ouvrir **Supabase → SQL Editor → New query**.
2. Copier **tout** le contenu de `supabase/apply-all.sql`, le coller, cliquer **Run**.
3. Vérifier dans **Table Editor** : on doit voir 39 tables, dont `teams` (14 lignes)
   et `fixtures` (91 lignes).

Ce fichier regroupe les migrations 0001 à 0005. Il ne s'exécute qu'**une seule
fois**. Les migrations suivantes (0010 et au-delà) s'appliqueront une par une.

### Choisir le code d'invitation

Le groupe est créé automatiquement par le script, avec le code de départ
`TOP14-2026`. Ce code est visible dans le dépôt : **change-le avant d'inviter
qui que ce soit.** Une ligne dans le SQL Editor :

```sql
update groups set invite_code = 'TON-CODE' where invite_code = 'TOP14-2026';
```

C'est le seul SQL que tu auras à lancer.

### Comment les joueurs entrent

Chacun est autonome : tu envoies **un lien**, il fait le reste.

```
https://ton-app.vercel.app/inscription?code=TON-CODE
```

Le code est déjà rempli à l'ouverture du lien. Le joueur choisit son prénom,
son avatar, un mot de passe, et il est dans le groupe. Pas de courriel de
confirmation, pas de validation de ta part, rien à faire de ton côté.

### Qui est administrateur

Personne n'a besoin d'être promu à la main. Les droits d'administration sont
attribués à l'inscription, à partir de la variable `ADMIN_EMAILS` renseignée
sur Vercel (voir l'étape 2). L'adresse qui y figure devient administratrice au
moment où elle s'inscrit — que ce soit avant ou après les autres joueurs.

Plusieurs adresses possibles, séparées par des virgules. Un joueur ne peut pas
se promouvoir : la variable n'existe que côté serveur.

---

## 2. Mettre l'application en ligne

1. **Vercel → Add New → Project**, importer le dépôt GitHub, brancher la branche
   de développement.
2. Renseigner les variables d'environnement (modèle dans `.env.example`) :

| Variable | Où la trouver |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | même écran → clé `anon public` — publique par nature |
| `SUPABASE_SERVICE_ROLE_KEY` | même écran → clé `service_role` — **secrète, serveur uniquement** |
| `SYNC_SECRET` | à inventer (une longue chaîne au hasard) |
| `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` — la moitié privée de la paire. La moitié publique s'enregistre depuis Administration → Notifications, pas ici. |
| `THESPORTSDB_KEY` | `123` (clé gratuite partagée) — fournisseur principal |
| `HIGHLIGHTLY_KEY` | clé RapidAPI (compte gratuit, 100 req/jour) — second fournisseur |
| `APISPORTS_KEY` | facultatif, dernier recours (saisons 2022-2024 en gratuit) |

3. Déployer.

> ⚠️ `service_role` donne tous les droits sur la base, RLS compris. Elle ne doit
> exister que dans les variables Vercel. Si elle fuite : Supabase → Project
> Settings → API → **Reset**, et elle est révoquée.

---

## 3. Brancher la synchronisation

Cloudflare → Workers → déployer le contenu de `worker/`, avec deux variables :
l'URL de l'application et `SYNC_SECRET` (la même que sur Vercel). Le cron
interroge les scores toutes les 5 minutes pendant les matchs, une fois par heure
sinon — et il maintient le projet Supabase éveillé, ce qui évite sa mise en
veille automatique au bout de 7 jours d'inactivité.

---

## À prévoir ensuite

**L'envoi d'e-mails.** Le SMTP intégré de Supabase est limité à 2 messages par
heure : inutilisable dès le troisième joueur. Comme l'inscription ne demande pas
de confirmation, ce n'est pas bloquant au lancement — mais il le deviendra à la
première réinitialisation de mot de passe. Créer un compte [Resend](https://resend.com)
(gratuit : 3 000 e-mails par mois) et le renseigner dans Supabase → Authentication
→ SMTP Settings.
