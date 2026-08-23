/**
 * Planificateur de synchronisation — Cloudflare Worker.
 *
 * Ce Worker ne connaît ni le rugby, ni Supabase : il appelle trois routes de
 * l'application avec le secret partagé, au bon moment. Toute l'intelligence
 * métier reste côté serveur Next.js.
 *
 * Ce qu'il fait, à chaque réveil (toutes les 5 minutes) :
 *   · si un match est en cours → POST /api/sync/live ;
 *   · sinon, au plus une fois par heure → POST /api/sync/live (ce passage
 *     maintient aussi le projet Supabase éveillé : un projet gratuit se met en
 *     veille après une semaine d'inactivité) ;
 *   · une fois par jour → POST /api/sync/calendar puis /api/sync/standings.
 *
 * L'heure du prochain passage n'est pas devinée : elle est renvoyée par
 * `/api/sync/live` (champ `nextCheckAt`) et rangée dans KV. C'est l'application
 * qui connaît le calendrier, pas le planificateur.
 *
 * Écrit en JavaScript et non en TypeScript : le `tsconfig.json` du projet
 * couvre tout le dépôt, et les types de Cloudflare casseraient `npm run build`.
 */

const KV_NEXT_LIVE = "next_live_check";
const KV_LAST_DAILY = "last_daily_run";

/** Heure UTC du passage quotidien (calendrier + classement), par défaut 4 h. */
const DEFAULT_DAILY_HOUR = 4;

const scheduler = {
  /** Réveil programmé par le cron de `wrangler.toml`. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCycle(env, new Date(event.scheduledTime)));
  },

  /**
   * Déclenchement manuel : `curl -H "x-sync-secret: …" https://…/`.
   * Pratique pour tester sans attendre le cron. Le même secret est exigé.
   */
  async fetch(request, env) {
    if (request.headers.get("x-sync-secret") !== env.SYNC_SECRET) {
      return new Response("Secret invalide.\n", { status: 401 });
    }
    const url = new URL(request.url);
    const report = await runCycle(env, new Date(), {
      force: url.searchParams.has("force"),
      daily: url.searchParams.has("daily"),
    });
    return Response.json(report);
  },
};

export default scheduler;

/** Un cycle complet : le direct si nécessaire, le quotidien une fois par jour. */
async function runCycle(env, now, options = {}) {
  const report = { at: now.toISOString(), actions: [] };

  try {
    const daily = await maybeRunDaily(env, now, options.daily === true);
    if (daily) report.actions.push(daily);
  } catch (error) {
    report.actions.push({ job: "daily", error: String(error) });
  }

  try {
    const live = await maybeRunLive(env, now, options.force === true);
    if (live) report.actions.push(live);
  } catch (error) {
    report.actions.push({ job: "live", error: String(error) });
  }

  return report;
}

// --- Le direct ---------------------------------------------------------------

/**
 * Appelle `/api/sync/live` seulement s'il y a lieu. La décision repose sur
 * `nextCheckAt`, renvoyé par l'appel précédent : pendant un match il vaut
 * « dans 5 minutes », en dehors « dans une heure » (ou l'heure du prochain
 * coup d'envoi, si elle est plus proche).
 */
async function maybeRunLive(env, now, force) {
  const state = kv(env);

  if (!force) {
    const nextCheck = await state.get(KV_NEXT_LIVE);
    if (nextCheck && now < new Date(nextCheck)) {
      return { job: "live", skipped: true, nextCheckAt: nextCheck };
    }
    // Sans KV disponible, on se rabat sur un passage en début d'heure : jamais
    // plus de 12 appels par heure, même si l'état est perdu.
    if (!nextCheck && !state.enabled && now.getUTCMinutes() >= 5) {
      return { job: "live", skipped: true, reason: "pas de KV : passage horaire" };
    }
  }

  const result = await callSync(env, "live");
  // Chaque cycle est aussi l'occasion de voir si un verrouillage approche.
  await callSync(env, "dispatch", "push");
  if (result.body && typeof result.body.nextCheckAt === "string") {
    await state.put(KV_NEXT_LIVE, result.body.nextCheckAt);
  } else {
    // Réponse inattendue ou route en panne : on réessaie dans un quart d'heure
    // plutôt que de marteler.
    await state.put(KV_NEXT_LIVE, new Date(now.getTime() + 15 * 60_000).toISOString());
  }

  return {
    job: "live",
    status: result.status,
    inWindow: result.body?.inWindow ?? null,
    fixturesUpdated: result.body?.fixturesUpdated ?? null,
    nextCheckAt: result.body?.nextCheckAt ?? null,
  };
}

// --- Le quotidien ------------------------------------------------------------

/**
 * Calendrier puis classement, une fois par jour. Le calendrier d'abord : c'est
 * lui qui confirme les horaires et donc les verrouillages.
 */
async function maybeRunDaily(env, now, force) {
  const state = kv(env);
  const today = now.toISOString().slice(0, 10);
  const dailyHour = Number(env.DAILY_HOUR_UTC ?? DEFAULT_DAILY_HOUR);

  if (!force) {
    const last = await state.get(KV_LAST_DAILY);
    if (last === today) return null;
    if (now.getUTCHours() < dailyHour) return null;
    // Sans KV, on s'en tient à la première fenêtre de 5 minutes de l'heure dite.
    if (!state.enabled && now.getUTCMinutes() >= 5) return null;
  }

  const calendar = await callSync(env, "calendar");
  const standings = await callSync(env, "standings");
  await state.put(KV_LAST_DAILY, today);

  return {
    job: "daily",
    calendar: {
      status: calendar.status,
      kickoffsConfirmed: calendar.body?.kickoffsConfirmed ?? null,
      fixturesCreated: calendar.body?.fixturesCreated ?? null,
      roundsCreated: calendar.body?.roundsCreated ?? null,
    },
    standings: { status: standings.status, rowsWritten: standings.body?.rowsWritten ?? null },
  };
}

// --- Appel des routes --------------------------------------------------------

async function callSync(env, kind, prefix = "sync") {
  const base = (env.APP_URL ?? "").replace(/\/$/, "");
  if (!base) throw new Error("APP_URL non configurée");
  if (!env.SYNC_SECRET) throw new Error("SYNC_SECRET non configurée");

  const response = await fetch(`${base}/api/${prefix}/${kind}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sync-secret": env.SYNC_SECRET,
    },
    body: "{}",
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    // La route a répondu autre chose que du JSON : on garde le code HTTP.
  }

  if (!response.ok) {
    console.error(`[worker] /api/${prefix}/${kind} → HTTP ${response.status}`, body);
  }
  return { status: response.status, body };
}

/**
 * Accès à KV, tolérant à son absence : le Worker doit rester fonctionnel même
 * si l'espace de noms n'a pas encore été créé.
 */
function kv(env) {
  const store = env.SYNC_STATE;
  if (!store) {
    return {
      enabled: false,
      get: async () => null,
      put: async () => {},
    };
  }
  return {
    enabled: true,
    get: (key) => store.get(key),
    put: (key, value) => store.put(key, value, { expirationTtl: 60 * 60 * 24 * 7 }),
  };
}
