/**
 * DIAGNOSTIC TEMPORAIRE — à retirer une fois les identifiants de saison
 * Highlightly (Top 14 / Pro D2) retrouvés et insérés dans `external_refs`.
 *
 * `syncLive` appelle `logHighlightlyLeaguesOnce` en tête de traitement. La
 * fonction ne fait rien tant que `DIAG_SECRET` n'est pas posé côté Vercel —
 * c'est ce qui permet de l'activer et de la désactiver sans redéploiement,
 * simplement en ajoutant/retirant cette variable d'environnement.
 *
 * Elle interroge la liste des compétitions Highlightly avec la vraie clé
 * (HIGHLIGHTLY_KEY, secret serveur, jamais journalisée) et n'écrit dans les
 * logs Vercel que les lignes dont le nom ressemble à Top 14 ou Pro D2 — pas
 * question de dumper 100+ compétitions dans un log applicatif.
 *
 * Ne journalise qu'une fois par instance serverless « chaude » (le drapeau
 * module-level suffit : chaque nouvelle instance froide retente, ce qui est
 * voulu tant que le diagnostic est actif).
 */

import { logger } from "../log.ts";

const HOST = "rugby-highlights-api.p.rapidapi.com";
const BASE = `https://${HOST}`;

let attempted = false;

function looksLikeTop14OrProD2(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("top 14") ||
    n.includes("top14") ||
    n.includes("pro d2") ||
    n.includes("prod2") ||
    n.includes("pro d 2")
  );
}

function extractLeagueEntries(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null);
  if (payload && typeof payload === "object") {
    const root = payload as Record<string, unknown>;
    const candidate = root.leagues ?? root.data ?? root.response ?? root.results;
    if (Array.isArray(candidate)) {
      return candidate.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null);
    }
  }
  return [];
}

export async function logHighlightlyLeaguesOnce(): Promise<void> {
  if (attempted) return;
  attempted = true;

  if (!process.env.DIAG_SECRET) return; // diagnostic désactivé
  const apiKey = process.env.HIGHLIGHTLY_KEY;
  if (!apiKey) {
    logger.error("diag.highlightly.no_key", {});
    return;
  }

  const headers = { "x-rapidapi-key": apiKey, "x-rapidapi-host": HOST, accept: "application/json" };

  for (const path of ["leagues", "leagues?name=Top%2014", "leagues?country=France"]) {
    try {
      const res = await fetch(`${BASE}/${path}`, { headers, cache: "no-store" });
      const text = await res.text();
      let entries: Array<Record<string, unknown>> = [];
      let parseError: string | undefined;
      try {
        entries = extractLeagueEntries(JSON.parse(text));
      } catch (e) {
        parseError = String(e);
      }

      const matches = entries.filter((e) => {
        const name = String(e.name ?? e.leagueName ?? e.displayName ?? "");
        return looksLikeTop14OrProD2(name);
      });

      logger.error("diag.highlightly.leagues", {
        path,
        status: res.status,
        totalEntries: entries.length,
        matches,
        // Si aucune entrée reconnue et le corps est court, on le garde tel
        // quel : ça arrive avec une erreur d'authentification ou de route.
        rawSample: entries.length === 0 ? text.slice(0, 1000) : undefined,
        parseError,
      });
    } catch (error) {
      logger.error("diag.highlightly.request_failed", { path, error });
    }
  }
}
