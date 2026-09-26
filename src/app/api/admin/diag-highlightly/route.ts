/**
 * DIAGNOSTIC TEMPORAIRE — À SUPPRIMER une fois les identifiants de saison
 * Highlightly (Top 14 / Pro D2) retrouvés et insérés dans `external_refs`.
 *
 * Sert uniquement à interroger la liste des compétitions connues de
 * Highlightly avec la vraie clé (HIGHLIGHTLY_KEY, secret Vercel, jamais
 * exposée ailleurs) pour retrouver le `leagueId` du Top 14 et du Pro D2.
 * Protégé par un secret dédié (DIAG_SECRET) distinct de SYNC_SECRET — cette
 * route n'écrit rien, elle ne fait que lire un fournisseur externe.
 *
 * Ne PAS laisser en production au-delà de ce diagnostic.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOST = "rugby-highlights-api.p.rapidapi.com";
const BASE = `https://${HOST}`;

export async function GET(request: Request) {
  const expected = process.env.DIAG_SECRET;
  const provided = request.headers.get("x-diag-secret");
  if (!expected || !provided || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.HIGHLIGHTLY_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "HIGHLIGHTLY_KEY absente" }, { status: 500 });
  }

  const headers = { "x-rapidapi-key": apiKey, "x-rapidapi-host": HOST, accept: "application/json" };

  const paths = ["leagues", "leagues?name=Top%2014", "leagues?search=Top%2014", "leagues?country=France"];
  const results: Record<string, unknown> = {};

  for (const path of paths) {
    try {
      const res = await fetch(`${BASE}/${path}`, { headers, cache: "no-store" });
      const text = await res.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        // texte brut conservé
      }
      results[path] = { status: res.status, body };
    } catch (error) {
      results[path] = { error: String(error) };
    }
  }

  return NextResponse.json(results);
}
