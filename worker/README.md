# Planificateur de synchronisation

Worker Cloudflare qui appelle les trois routes de synchronisation de
l'application. Il ne contient aucune logique métier : il décide **quand**
appeler, l'application décide **quoi faire**.

## Ce qu'il fait

| Quand | Ce qu'il appelle |
|---|---|
| Toutes les 5 min, pendant un match | `POST /api/sync/live` |
| Une fois par heure, hors match | `POST /api/sync/live` (maintient aussi Supabase éveillé) |
| Une fois par jour, à `DAILY_HOUR_UTC` | `POST /api/sync/calendar` puis `POST /api/sync/standings` |

Le Worker ne connaît pas le calendrier. Chaque réponse de `/api/sync/live`
contient `nextCheckAt` : c'est l'application, qui a les matchs en base, qui dit
quand revenir. Le Worker range cette date dans KV et se rendort.

## Configuration

| Variable | Où | À quoi ça sert |
|---|---|---|
| `APP_URL` | `wrangler.toml`, section `[vars]` | URL de l'application déployée |
| `DAILY_HOUR_UTC` | `wrangler.toml`, section `[vars]` | Heure UTC du passage quotidien (4 par défaut) |
| `SYNC_SECRET` | secret Wrangler | Le secret partagé avec l'application |
| `SYNC_STATE` | espace de noms KV | Prochaine vérification, date du dernier passage quotidien |

Le même `SYNC_SECRET` doit être configuré côté Vercel. Il n'apparaît jamais
dans une variable `NEXT_PUBLIC_*`, ni dans `wrangler.toml`.

## Déploiement

```bash
cd worker
npx wrangler kv namespace create SYNC_STATE   # une seule fois
# reporter l'identifiant renvoyé dans wrangler.toml
npx wrangler secret put SYNC_SECRET           # même valeur que sur Vercel
npx wrangler deploy
```

Sans espace de noms KV, le Worker fonctionne quand même : il retombe sur une
cadence horaire fixe (un appel dans les 5 premières minutes de chaque heure).
C'est un mode dégradé, pas le mode normal — le direct y perd sa finesse.

## Déclenchement manuel

```bash
curl -H "x-sync-secret: $SYNC_SECRET" https://pronos-sync.<compte>.workers.dev/
curl -H "x-sync-secret: $SYNC_SECRET" "https://…/?force"   # force le direct
curl -H "x-sync-secret: $SYNC_SECRET" "https://…/?daily"   # force le quotidien
```

## Coût

288 réveils par jour sur les 100 000 requêtes quotidiennes de l'offre gratuite.
La plupart n'appellent rien du tout.

## Pourquoi du JavaScript et pas du TypeScript

Le `tsconfig.json` du projet couvre tout le dépôt : un fichier `.ts` ici serait
vérifié par `next build`, avec des types Cloudflare qu'il ne connaît pas. Le
Worker fait 200 lignes et n'a pas de logique métier — le JavaScript suffit, et
évite de toucher à une configuration partagée par tous les chantiers.
