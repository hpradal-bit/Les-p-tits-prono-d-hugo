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

### Créer le groupe et le premier administrateur

Toujours dans le SQL Editor, après avoir créé ton compte depuis l'application :

```sql
-- 1. Le groupe et son code d'invitation
insert into groups (name, invite_code)
values ('Les p''tits pronos', 'TOP14');

-- 2. Te déclarer administrateur (remplacer l'adresse)
insert into group_members (group_id, user_id, role)
select g.id, u.id, 'admin'
from groups g, auth.users u
where g.invite_code = 'TOP14' and u.email = 'hpradal@gmail.com';
```

Les cinq autres joueurs s'inscrivent ensuite avec le code `TOP14` et sont
rattachés automatiquement, en tant que joueurs.

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
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` |
| `APISPORTS_KEY` | facultatif, source de secours |

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
