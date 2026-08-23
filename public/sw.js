/* eslint-disable */
/**
 * Les p'tits pronos d'Hugo — service worker.
 * ---------------------------------------------------------------------------
 * Deux stratégies, pas une de plus :
 *
 *   · cache-first          logos, icônes, polices, bundles /_next/static —
 *                          des fichiers au nom versionné, donc immuables.
 *   · stale-while-revalidate  les pages. On rend immédiatement la dernière
 *                          version connue, et on rafraîchit en arrière-plan.
 *                          C'est ce qui rend le classement consultable dans
 *                          le métro : la dernière version vue reste lisible.
 *
 * Et un filet : une page hors-ligne soignée quand rien n'est en cache.
 *
 * Le reste du fichier gère le Web Push (affichage, clic, ré-abonnement).
 *
 * ⚠️ Ce fichier est servi tel quel depuis /sw.js : pas de bundler, pas
 * d'import. Du JavaScript de navigateur, lisible à l'œil nu.
 */

const VERSION = "v1";
const SHELL_CACHE = `pronos-shell-${VERSION}`; // cache-first
const PAGES_CACHE = `pronos-pages-${VERSION}`; // stale-while-revalidate
const CURRENT_CACHES = [SHELL_CACHE, PAGES_CACHE];

/** Nombre de pages conservées hors-ligne. Au-delà, on jette les plus vieilles. */
const MAX_PAGES = 40;

/** Fichiers au nom versionné ou strictement statiques : cache-first. */
const IMMUTABLE = /^\/(?:_next\/static|logos|icons)\//;

/** Polices Google, servies depuis un autre domaine : cache-first également. */
const FONT_ORIGINS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"];

/* ==========================================================================
   Cycle de vie
   ========================================================================== */

self.addEventListener("install", () => {
  // Rien à pré-charger : la page hors-ligne est intégrée à ce fichier, elle
  // est donc disponible dès la première seconde, sans requête réseau.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("pronos-") && !CURRENT_CACHES.includes(n))
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "SKIP_WAITING") self.skipWaiting();
  // À appeler à la déconnexion : les pages en cache contiennent des données
  // personnelles (pronostics, classement). On ne les laisse pas derrière soi.
  if (type === "CLEAR_PAGES") event.waitUntil(caches.delete(PAGES_CACHE));
});

/* ==========================================================================
   Interception réseau
   ========================================================================== */

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (FONT_ORIGINS.includes(url.origin)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Les routes d'API ne sont jamais mises en cache : abonnement push,
  // enregistrement d'un pronostic, réglages… tout doit atteindre le serveur.
  if (url.pathname.startsWith("/api/")) return;

  if (IMMUTABLE.test(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  if (url.pathname === "/manifest.webmanifest" || url.pathname === "/favicon.ico") {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(staleWhileRevalidate(event, request));
  }
});

/** Immuable : on sert le cache et on ne redemande rien. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response && (response.ok || response.type === "opaque")) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return hit || Response.error();
  }
}

/**
 * Pages : on rend le cache tout de suite, on rafraîchit derrière.
 *
 * Note assumée : on met en cache même quand le serveur répond `no-store`.
 * Next.js marque ainsi toutes les pages dynamiques ; le respecter reviendrait
 * à n'avoir aucun mode hors-ligne. Le cache est local à l'appareil, et il est
 * vidé à la déconnexion via le message `CLEAR_PAGES`.
 */
async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(PAGES_CACHE);
  const cached = await cache.match(request, { ignoreSearch: false });

  const fromNetwork = fetch(request)
    .then(async (response) => {
      if (response && response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
        await trimCache(cache, MAX_PAGES);
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(fromNetwork);
    return cached;
  }

  const fresh = await fromNetwork;
  return fresh || offlinePage(request);
}

async function trimCache(cache, max) {
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

/* ==========================================================================
   La page hors-ligne
   ========================================================================== */

async function offlinePage(request) {
  // Ce qui reste consultable sans réseau : uniquement ce qui a déjà été vu.
  const cache = await caches.open(PAGES_CACHE);
  const keys = await cache.keys();
  const available = [];
  const seen = new Set();
  for (const key of keys) {
    const path = new URL(key.url).pathname;
    if (seen.has(path) || path === new URL(request.url).pathname) continue;
    seen.add(path);
    available.push({ path, label: labelFor(path) });
  }
  available.sort((a, b) => a.label.localeCompare(b.label, "fr"));

  return new Response(offlineHtml(available), {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function labelFor(path) {
  if (path === "/") return "Accueil";
  const named = {
    "/classement": "Classement",
    "/journee": "La journée",
    "/vestiaire": "Le Vestiaire",
    "/profil": "Mon profil",
    "/questions": "Questions bonus",
    "/reglages": "Réglages",
    "/installer": "Installer l'app",
  };
  if (named[path]) return named[path];
  const last = path.replace(/\/$/, "").split("/").filter(Boolean).pop() || path;
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, " ");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function offlineHtml(available) {
  const links = available.length
    ? `<nav class="links" aria-label="Pages consultables hors-ligne">${available
        .map(
          (p) =>
            `<a href="${escapeHtml(p.path)}"><span>${escapeHtml(p.label)}</span><span aria-hidden="true">→</span></a>`,
        )
        .join("")}</nav>
       <p class="hint">Ces pages s'affichent dans leur dernière version connue.</p>`
    : `<p class="hint">Rien n'a encore été mis en cache sur cet appareil. Ouvre l'application une fois connectée : le classement restera ensuite consultable hors réseau.</p>`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Hors-ligne · Les p'tits pronos d'Hugo</title>
<style>
  :root {
    --ground:#F2F4F0; --surface:#FFFFFF; --surface-sunk:#EAEEE7;
    --ink:#101A14; --ink-muted:#56685C; --ink-faint:#83978A;
    --line:#D9E0D6; --pine:#14663F; --pine-soft:#E1EEE6;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ground:#0C110E; --surface:#141B17; --surface-sunk:#101713;
      --ink:#E7EEE8; --ink-muted:#94A499; --ink-faint:#6D7D73;
      --line:#242F28; --pine:#4FB183; --pine-soft:#112620;
    }
  }
  * { box-sizing:border-box; }
  body {
    margin:0; min-height:100dvh; background:var(--ground); color:var(--ink);
    font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
    -webkit-font-smoothing:antialiased;
    display:flex; align-items:center; justify-content:center;
    padding:calc(env(safe-area-inset-top) + 24px) 24px calc(env(safe-area-inset-bottom) + 24px);
  }
  main { width:100%; max-width:24rem; display:flex; flex-direction:column; gap:24px; }
  .ball { width:64px; height:64px; }
  .eyebrow {
    margin:0; font-family:ui-monospace,SFMono-Regular,monospace; font-size:10px;
    letter-spacing:.14em; text-transform:uppercase; color:var(--ink-faint);
  }
  h1 { margin:8px 0 0; font-size:1.75rem; line-height:1.1; letter-spacing:-.02em; }
  .lede { margin:12px 0 0; color:var(--ink-muted); line-height:1.55; }
  .links { display:flex; flex-direction:column; gap:1px; background:var(--line);
           border:1px solid var(--line); border-radius:14px; overflow:hidden; }
  .links a {
    display:flex; align-items:center; justify-content:space-between; gap:12px;
    padding:14px 16px; background:var(--surface); color:var(--ink);
    text-decoration:none; font-weight:600; font-size:15px;
  }
  .links a:active { background:var(--surface-sunk); }
  .links a span[aria-hidden] { color:var(--pine); }
  .hint { margin:0; font-size:13px; line-height:1.5; color:var(--ink-faint); }
  button {
    width:100%; padding:14px 20px; border:0; border-radius:999px;
    background:var(--pine); color:#fff; font:inherit; font-weight:600; font-size:15px;
    cursor:pointer;
  }
  .status { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--ink-muted); }
  .dot { width:8px; height:8px; border-radius:999px; background:#D6453C; flex:none; }
</style>
</head>
<body>
<main>
  <svg class="ball" viewBox="0 0 100 100" role="img" aria-label="Ballon de rugby">
    <ellipse cx="50" cy="50" rx="34.5" ry="21.4" fill="var(--pine)" transform="rotate(-22 50 50)"/>
    <g stroke="var(--ground)" stroke-width="4.2" stroke-linecap="butt" transform="rotate(-22 50 50)">
      <line x1="34" y1="50" x2="66" y2="50"/>
      <line x1="35.5" y1="43" x2="35.5" y2="57"/>
      <line x1="42.7" y1="43" x2="42.7" y2="57"/>
      <line x1="50" y1="43" x2="50" y2="57"/>
      <line x1="57.3" y1="43" x2="57.3" y2="57"/>
      <line x1="64.5" y1="43" x2="64.5" y2="57"/>
    </g>
  </svg>

  <header>
    <p class="eyebrow">Les p'tits pronos d'Hugo</p>
    <h1>Pas de réseau</h1>
    <p class="lede">Le téléphone n'attrape rien pour l'instant — un tunnel, un stade plein, ça arrive. L'application reprendra toute seule dès que ça revient.</p>
  </header>

  ${links}

  <button type="button" onclick="location.reload()">Réessayer</button>

  <p class="status"><span class="dot" aria-hidden="true"></span><span id="etat">Hors-ligne</span></p>
</main>
<script>
  addEventListener("online", function () { location.reload(); });
  if (navigator.onLine) {
    document.getElementById("etat").textContent = "Connexion instable";
  }
</script>
</body>
</html>`;
}

/* ==========================================================================
   Web Push
   ==========================================================================
   Le serveur envoie une charge JSON : { title, body, url, kind, tag }.
   Le regroupement est déjà fait côté serveur (une notification par journée,
   jamais une par match) ; le `tag` ajoute une deuxième barrière : deux envois
   de même tag se remplacent à l'écran au lieu de s'empiler.
   ========================================================================== */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Les p'tits pronos d'Hugo";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || payload.kind || "pronos",
    renotify: payload.renotify !== false,
    data: { url: payload.url || "/", kind: payload.kind || null },
    lang: "fr",
    dir: "ltr",
    requireInteraction: false,
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if (new URL(client.url).origin !== target.origin) continue;
        await client.focus();
        if ("navigate" in client) await client.navigate(target.href);
        return;
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});

/**
 * Le navigateur peut renouveler un abonnement de lui-même (rotation de clé,
 * expiration). Sans ce gestionnaire, le joueur cesse silencieusement de
 * recevoir ses notifications.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const previous = event.oldSubscription || (await self.registration.pushManager.getSubscription());
      const applicationServerKey =
        (event.newSubscription && event.newSubscription.options.applicationServerKey) ||
        (previous && previous.options && previous.options.applicationServerKey);
      if (!applicationServerKey) return;

      const subscription =
        event.newSubscription ||
        (await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        }));

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          previousEndpoint: previous ? previous.endpoint : null,
          userAgent: self.navigator ? self.navigator.userAgent : null,
        }),
      });
    })(),
  );
});
