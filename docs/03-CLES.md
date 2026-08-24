# 🔑 Les clés du projet — où elles vivent, à quoi elles servent

> **Aucune valeur secrète n'est écrite ici.** Le dépôt est sur GitHub : une clé
> privée y resterait dans l'historique pour toujours, même effacée ensuite.
> Ce document dit **où trouver** chaque clé et **quoi faire** quand elle casse.
>
> Les valeurs secrètes se rangent ailleurs : trousseau iCloud, gestionnaire de
> mots de passe, ou une note verrouillée. Jamais dans un fichier du projet.

---

## Les adresses à connaître

| Quoi | Adresse |
|---|---|
| **L'application** (celle à donner aux joueurs) | `https://les-p-tits-prono-d-hugo.vercel.app` |
| Espace admin — synchronisation | `…/admin/synchronisation` |
| Espace admin — notifications | `…/admin/push-settings` |
| Hébergement du site | vercel.com → projet `les-p-tits-prono-d-hugo` |
| Base de données | supabase.com → projet `pronos-top14` (`fubgapghkagjicxmtbdy`) |
| Planificateur | dash.cloudflare.com → Workers → `pronos-sync` |

> ⚠️ **N'utilise jamais une adresse contenant une suite de lettres au milieu**
> (`…-31pu34bf8-…`) : c'est un déploiement figé dans le passé, qui ne verra ni
> les nouvelles clés ni les corrections. Toujours l'adresse courte.

---

## Les valeurs publiques

Celles-ci ne sont pas secrètes — elles voyagent déjà vers les navigateurs ou
sont de simples identifiants. Les noter fait gagner du temps.

| Nom | Valeur | Rôle |
|---|---|---|
| Identifiant ESPN du Top 14 | `270559` | Range dans `external_refs`, pas dans une variable |
| Identifiant API-Sports de la saison | `16:2026` | Idem |
| `VAPID_SUBJECT` | `mailto:hpradal@gmail.com` | Exigé par Apple, doit être `mailto:` ou `https:` |
| Clé publique VAPID | *dans l'espace admin* | Visible sur `/admin/push-settings`, elle n'est pas secrète |

---

## Les secrets, et où ils habitent

| Nom | Où il est enregistré | Sans lui |
|---|---|---|
| `VAPID_PRIVATE_KEY` | Vercel → Settings → Environment Variables | Aucune notification ne part |
| `SYNC_SECRET` | Vercel **et** Cloudflare (même valeur des deux côtés) | Le planificateur reçoit un 401 |
| `APISPORTS_KEY` | Vercel → Settings → Environment Variables | Plus de secours si ESPN tombe, et plus de classement |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel uniquement — **jamais** dans un `NEXT_PUBLIC_*` | Le serveur ne peut plus écrire |
| `CLOUDFLARE_API_TOKEN` | GitHub → Settings → Secrets and variables → Actions | Le planificateur ne peut plus être redéployé |

Les deux secrets rangés chez **GitHub** (`CLOUDFLARE_API_TOKEN` et une copie de
`SYNC_SECRET`) servent au déploiement automatique du planificateur : c'est
GitHub qui pousse le Worker chez Cloudflare, pas une ligne de commande.

### Vercel marque certaines variables « Sensitive »

Une variable marquée ainsi est **définitivement illisible**, y compris pour
toi. Le `sk_live_a12…` affiché en gris n'est qu'un exemple, pas ta valeur.

**Conséquence :** si tu perds un secret marqué *Sensitive*, il ne se retrouve
pas — il se **remplace**. Génère une nouvelle valeur, écris-la aux deux
endroits, redéploie.

### Une variable modifiée n'atteint pas un déploiement déjà en ligne

C'est le piège qui a coûté le plus de temps sur ce projet, deux fois. Après
avoir ajouté ou changé une variable chez Vercel :

> **Deployments → les trois points `···` de la première ligne → Redeploy**

Sans ça, l'application continue de tourner avec l'ancienne valeur, sans rien
signaler.

---

## Le planificateur Cloudflare

Il n'a **pas d'adresse web** : il se réveille par son minuteur, toutes les
5 minutes, et décide seul s'il y a lieu d'appeler l'application. Rien à
exposer, donc rien à attaquer.

| | |
|---|---|
| Nom du Worker | `pronos-sync` |
| Minuteur | `*/5 * * * *` |
| Espace KV | `SYNC_STATE` — il y note l'heure du prochain passage |
| Passage quotidien | 4 h UTC (6 h à Paris) : calendrier puis classement |
| Déploiement | `.github/workflows/deploy-worker.yml` |

**Pour le redéployer** : rien à faire à la main. Toute modification de
`worker/` le redéploie. Sinon, GitHub → onglet **Actions** → *Déployer le
planificateur* → **Run workflow**.

### Ce qui a coûté du temps à le mettre en place

1. **Le jeton n'était pas un jeton.** 79 caractères au lieu de 40 : la ligne
   `curl` d'exemple avait été copiée avec. Le workflow vérifie désormais la
   longueur et interroge Cloudflare avant de déployer, plutôt que de laisser
   wrangler répondre « Authentication failed [code: 9106] ».
2. **Un secret ne se pose pas sur un Worker absent.** Créer d'abord, régler
   ensuite — deux étapes distinctes.
3. **Cloudflare exige un sous-domaine sur le compte**, même quand le Worker
   n'en utilise aucun. Il se crée en ouvrant une fois la page *Workers et
   Pages* (`hpradal.workers.dev`).

---

## Regénérer une clé

### La paire VAPID (notifications)

```
npx web-push generate-vapid-keys
```

La **publique** (87 caractères) va dans `/admin/push-settings`.
La **privée** (43 caractères) va dans `VAPID_PRIVATE_KEY` chez Vercel.

Les deux doivent venir de la **même génération** : dépareillées, le service de
push répond `403 VapidPkHashMismatch`. L'écran d'administration le vérifie
désormais tout seul et le dit avant tout envoi.

Après un changement de paire, chaque joueur doit rouvrir l'app : l'abonnement
périmé est détecté et remplacé automatiquement.

### Le secret de synchronisation

```
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

À écrire **aux deux endroits** — Vercel (`SYNC_SECRET`) et Cloudflare (secret
du Worker `pronos-sync`) — puis redéployer côté Vercel.

### La clé API-Sports

Sur `dashboard.api-football.com`, rubrique *Profile*. Offre gratuite :
**100 requêtes par jour**, remise à zéro à minuit UTC.

> ⚠️ **L'offre gratuite ne dessert que les saisons 2022 à 2024.** Toute demande
> sur 2026-27 est refusée : *« Free plans do not have access to this season »*.
> API-Sports n'est donc **pas** un secours utilisable pour la saison en cours :
> ESPN en est aujourd'hui le seul fournisseur. Le filet, en cas de panne, ce
> sont les boutons de `/admin/synchronisation`.
>
> API-Sports reste dans la chaîne : il ne coûte rien tant qu'on ne l'appelle
> pas, et l'ordre se change en base (`sync.provider_order`) le jour d'un
> abonnement payant.

---

## Vérifier que tout est en place, sans rien deviner

L'espace admin le dit lui-même. Deux écrans suffisent :

**`/admin/synchronisation`** — compétition rattachée, secours API-Sports,
alias posés, équipes rapprochées, horaires confirmés, secret du planificateur.

**`/admin/push-settings`** — clé publique, clé privée, **paire cohérente**,
sujet du jeton, appareils abonnés, règles du groupe.

Une ligne grise ou rouge nomme ce qui manque et ce qu'il faut faire. C'est plus
fiable que de chercher dans les réglages de trois fournisseurs.

---

## Les réglages qui ne sont pas des clés

Beaucoup de choses qu'on croit codées en dur vivent en base, dans
`app_settings`, et se changent sans redéploiement :

| Clé | Aujourd'hui | Ce qu'elle règle |
|---|---|---|
| `sync.live_interval_minutes` | `10` | Cadence du relevé pendant les matchs |
| `sync.idle_interval_minutes` | `60` | Cadence hors match |
| `sync.provider_order` | ESPN d'abord partout | Qui est interrogé en premier |
| `sync.team_aliases` | 25 graphies | Rattrape les noms d'équipe inhabituels |
| `sync.apisports_daily_quota` | `100` | Budget quotidien, sert au ralentissement automatique |
| `notifications.max_per_day` | `3` | Plafond par joueur |
| `notifications.quiet_from` / `_to` | `23:00` → `08:00` | Heures de silence du groupe |

Les cinq derniers se modifient depuis `/admin/push-settings`.
