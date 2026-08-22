"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRuleset, loadSettings, setting } from "@/lib/settings";
import type { Uuid } from "@/lib/types";
import { exactScoreVerdict, monthKeyOf, type ExactAttempt } from "./exact-score";
import { applyDefaultPredictionsForRound } from "./round-lock";
import { roundIdSchema, saveRoundSchema } from "./schemas";

/* ---------------------------------------------------------------------------
   Actions serveur du chantier « Pronostics & verrouillage ».

   Trois règles qui ne se négocient pas :

   1. Tout ce qui entre est validé par Zod, même si l'écran a déjà validé.
   2. On écrit avec le client du joueur, soumis à RLS — jamais avec la clé de
      service. Si la base refuse, c'est qu'elle a raison.
   3. Le verrou définitif est celui de la base : la politique RLS et le
      déclencheur `predictions_guard` comparent `locks_at` à `now()` côté
      PostgreSQL. Les contrôles faits ici ne servent qu'à répondre au joueur
      match par match, en français, plutôt que de lui renvoyer une erreur SQL.
   --------------------------------------------------------------------------- */

export interface SaveOutcome {
  ok: boolean;
  /** Nombre de pronostics effectivement enregistrés. */
  saved: number;
  /** Message général, à afficher tel quel. */
  message: string;
  /** Refus match par match : identifiant du match → raison. */
  rejected: Record<Uuid, string>;
}

function fail(message: string, rejected: Record<Uuid, string> = {}): SaveOutcome {
  return { ok: false, saved: 0, message, rejected };
}

/**
 * Enregistre les pronostics d'une journée, en un seul appel.
 *
 * L'écran envoie toute la journée d'un coup : c'est ce qui permet de jouer les
 * sept matchs en moins d'une minute sans sept allers-retours réseau.
 */
export async function saveRoundPredictions(input: unknown): Promise<SaveOutcome> {
  const parsed = saveRoundSchema.safeParse(input);
  if (!parsed.success) {
    return fail(`Pronostic invalide : ${parsed.error.issues[0]?.message ?? "données inattendues."}`);
  }
  const { roundId, predictions } = parsed.data;

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return fail("Session expirée : reconnecte-toi.");

  // --- La journée et sa saison ----------------------------------------------
  const { data: round } = await sb
    .from("rounds")
    .select("id, season_id")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return fail("Journée introuvable.");
  const seasonId = String(round.season_id);

  // --- Les matchs soumis appartiennent-ils bien à cette journée ? -----------
  const fixtureIds = predictions.map((p) => p.fixtureId);
  const { data: fixtureRows, error: fixtureError } = await sb
    .from("fixtures")
    .select("id, round_id, kickoff_at, locks_at")
    .in("id", fixtureIds);

  if (fixtureError) return fail("Impossible de relire les matchs.");
  const fixtures = fixtureRows ?? [];
  if (fixtures.length !== fixtureIds.length) return fail("Un des matchs est introuvable.");
  if (fixtures.some((f) => String(f.round_id) !== roundId)) {
    return fail("Un des matchs n'appartient pas à cette journée.");
  }

  const rejected: Record<Uuid, string> = {};

  // --- Barème & réglages -----------------------------------------------------
  const ruleset = await loadRuleset(sb, seasonId);
  const settings = await loadSettings(sb);
  const timeZone = setting(settings, "timezone", "Europe/Paris");

  // --- Tous les matchs de la saison, pour situer les périodes du quota -------
  const { data: seasonRoundRows } = await sb
    .from("rounds")
    .select("id")
    .eq("season_id", seasonId);
  const { data: seasonFixtureRows } = await sb
    .from("fixtures")
    .select("id, round_id, kickoff_at")
    .in(
      "round_id",
      (seasonRoundRows ?? []).map((r) => String(r.id)),
    );
  const seasonFixtures = seasonFixtureRows ?? [];

  // --- Scores exacts : l'état APRÈS cet enregistrement ----------------------
  const { data: mine } = await sb
    .from("predictions")
    .select("fixture_id")
    .eq("user_id", user.id)
    .not("exact_home_score", "is", null);

  const futureExact = new Set((mine ?? []).map((p) => String(p.fixture_id)));
  for (const p of predictions) {
    if (p.exactHomeScore === null) futureExact.delete(p.fixtureId);
    else futureExact.add(p.fixtureId);
  }

  const attempts: ExactAttempt[] = seasonFixtures
    .filter((f) => futureExact.has(String(f.id)))
    .map((f) => ({
      fixtureId: String(f.id),
      roundId: String(f.round_id),
      seasonId,
      monthKey: monthKeyOf(String(f.kickoff_at), timeZone),
    }));

  // --- Préparation de l'écriture, match par match ---------------------------
  const now = Date.now();
  const toWrite = [];

  for (const p of predictions) {
    const fixture = fixtures.find((f) => String(f.id) === p.fixtureId)!;

    // Pré-contrôle de courtoisie : le refus qui fait foi est celui de la base.
    if (Date.parse(String(fixture.locks_at)) <= now) {
      rejected[p.fixtureId] = "Match verrouillé : trop tard.";
      continue;
    }

    if (p.exactHomeScore !== null) {
      const verdict = exactScoreVerdict(ruleset, attempts, {
        fixtureId: p.fixtureId,
        roundId,
        seasonId,
        monthKey: monthKeyOf(String(fixture.kickoff_at), timeZone),
      });
      if (!verdict.allowed) {
        rejected[p.fixtureId] = verdict.eligible
          ? "Quota de scores exacts épuisé."
          : "Score exact non autorisé sur ce match.";
        continue;
      }
    }

    toWrite.push({
      user_id: user.id,
      fixture_id: p.fixtureId,
      outcome: p.outcome,
      margin_bucket_id: ruleset.marginMode === "distance" ? null : p.marginBucketId,
      margin_value: ruleset.marginMode === "distance" ? p.marginValue : null,
      exact_home_score: p.exactHomeScore,
      exact_away_score: p.exactAwayScore,
      is_auto: false,
    });
  }

  if (toWrite.length === 0) {
    return {
      ok: false,
      saved: 0,
      message: "Aucun pronostic n'a pu être enregistré.",
      rejected,
    };
  }

  const { data: written, error } = await sb
    .from("predictions")
    .upsert(toWrite, { onConflict: "user_id,fixture_id" })
    .select("fixture_id");

  if (error) {
    // Le garde-fou de la base a parlé (verrouillage ou quota) : ses messages
    // sont déjà rédigés en français, on les rend tels quels.
    return fail(error.message, rejected);
  }

  // RLS filtre en silence une ligne verrouillée entre-temps : on le détecte en
  // comparant ce qui est revenu à ce qu'on avait envoyé.
  const writtenIds = new Set((written ?? []).map((w) => String(w.fixture_id)));
  for (const row of toWrite) {
    if (!writtenIds.has(row.fixture_id)) {
      rejected[row.fixture_id] = "Match verrouillé pendant l'enregistrement.";
    }
  }

  const saved = writtenIds.size;
  const refused = Object.keys(rejected).length;

  revalidatePath("/journee");

  return {
    ok: refused === 0,
    saved,
    message:
      refused === 0
        ? saved > 1
          ? `${saved} pronostics enregistrés.`
          : "Pronostic enregistré."
        : `${saved} enregistré${saved > 1 ? "s" : ""}, ${refused} refusé${refused > 1 ? "s" : ""}.`,
    rejected,
  };
}

export interface LockRoundOutcome {
  ok: boolean;
  message: string;
}

/**
 * Applique les pronos par défaut sur une journée dont l'heure est passée.
 *
 * Réservé à l'admin : c'est le filet de sécurité si le planificateur n'a pas
 * tourné. L'opération est rejouable et laisse une trace dans `admin_actions`.
 */
export async function applyRoundDefaults(input: unknown): Promise<LockRoundOutcome> {
  const parsed = roundIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Journée invalide." };

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, message: "Session expirée." };

  const { data: membership } = await sb
    .from("group_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!membership) return { ok: false, message: "Réservé à l'administrateur." };

  const admin = createAdminClient();
  const report = await applyDefaultPredictionsForRound(admin, parsed.data.roundId);

  // Règle 6 : toute action d'administration laisse une trace, avec sa raison.
  await admin.from("admin_actions").insert({
    admin_id: user.id,
    action: "round.defaults_applied",
    entity_type: "round",
    entity_id: parsed.data.roundId,
    after: { ...report },
    reason: "Application manuelle des pronos par défaut au verrouillage.",
  });

  revalidatePath("/journee");

  if (!report.defaultPredictionEnabled) {
    return { ok: true, message: "Le prono par défaut est désactivé dans le barème." };
  }
  if (report.lockedFixtures === 0) {
    return { ok: true, message: "Aucun match de cette journée n'est encore verrouillé." };
  }
  return {
    ok: true,
    message:
      report.created > 0
        ? `${report.created} prono${report.created > 1 ? "s" : ""} par défaut posé${report.created > 1 ? "s" : ""}.`
        : "Tout le monde avait joué : rien à poser.",
  };
}
