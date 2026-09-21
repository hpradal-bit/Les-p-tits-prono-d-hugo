/**
 * Journalisation structurée.
 *
 * Audit technique, point 5 (P1) : jusqu'ici, seuls des `console.error` ad hoc
 * finissaient dans les logs Vercel — sans corrélation, sans contexte
 * exploitable, impossibles à interroger après coup. Budget 0 €/mois oblige
 * (`AGENTS.md`) : pas de Sentry/Datadog, un utilitaire local qui écrit du
 * JSON sur stdout/stderr — c'est déjà ce que Vercel collecte et indexe.
 *
 * Chaque ligne est un objet JSON avec :
 *   - `level` : 'info' | 'warn' | 'error'
 *   - `event` : un code stable, en anglais, façon `sync.live.failed` — pensé
 *     pour être filtré/recherché, jamais une phrase libre ;
 *   - `requestId` : un identifiant qui relie toutes les lignes d'une même
 *     requête HTTP ou d'une même exécution de synchro (voir `withRequestId`) ;
 *   - `context` : les données utiles au diagnostic (ids, ligue, saison…) —
 *     jamais de secret (clé de service, jeton) ;
 *   - `error` : si présent dans le contexte, sérialisé proprement (message +
 *     nom + pile), pour ne jamais perdre la pile d'une exception dans un
 *     `JSON.stringify` par défaut qui l'ignore.
 *
 * Ce n'est pas un remplacement de `admin_actions`/`sync_runs` (le journal
 * métier, immuable, lisible par les joueurs) : c'est l'équivalent technique,
 * pour le diagnostic après incident, de ce qu'un `console.error` isolé ne
 * permettait pas de faire — corréler plusieurs lignes entre elles.
 */

import { randomUUID } from "node:crypto";

type LogLevel = "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

function serializeError(value: unknown): SerializedError | undefined {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value === undefined) return undefined;
  return { name: "NonError", message: String(value) };
}

/**
 * Sépare `error` (sérialisé à part) du reste du contexte, pour que
 * `JSON.stringify` ne le réduise jamais à `{}` — le piège classique d'un
 * objet `Error` passé tel quel.
 */
function normalizeContext(context: LogContext | undefined): {
  rest: LogContext;
  error?: SerializedError;
} {
  if (!context) return { rest: {} };
  const { error, ...rest } = context;
  return { rest, error: serializeError(error) };
}

function write(level: LogLevel, event: string, context?: LogContext): void {
  const { rest, error } = normalizeContext(context);
  const line = {
    level,
    event,
    time: new Date().toISOString(),
    ...rest,
    ...(error ? { error } : {}),
  };

  const payload = JSON.stringify(line);
  // `error`/`warn` vont sur stderr — c'est ce que Vercel étiquette comme tel
  // dans ses logs, permettant de filtrer sans dépendre du champ `level`.
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.log(payload);
}

export const logger = {
  info(event: string, context?: LogContext): void {
    write("info", event, context);
  },
  warn(event: string, context?: LogContext): void {
    write("warn", event, context);
  },
  error(event: string, context?: LogContext): void {
    write("error", event, context);
  },
  /** Un logger dont chaque ligne porte automatiquement ce contexte fixe. */
  with(fixed: LogContext) {
    return {
      info: (event: string, context?: LogContext) => write("info", event, { ...fixed, ...context }),
      warn: (event: string, context?: LogContext) => write("warn", event, { ...fixed, ...context }),
      error: (event: string, context?: LogContext) => write("error", event, { ...fixed, ...context }),
    };
  },
};

/**
 * Un identifiant court, à passer en `requestId` pour relier toutes les
 * lignes d'une même requête (route API, action serveur, exécution de
 * synchro). `randomUUID()` est disponible côté Node comme côté Edge runtime
 * récent ; les routes de synchro tournent en `runtime = "nodejs"`.
 */
export function newRequestId(): string {
  return randomUUID();
}

/** Un logger corrélé à une requête — `event` reste libre, `requestId` est fixe. */
export function requestLogger(requestId: string = newRequestId()) {
  return logger.with({ requestId });
}
