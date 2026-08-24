import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyDefaultPredictionsForDueRounds } from "@/lib/predictions/round-lock";
import { checkSyncSecret } from "@/lib/providers/sync/guard.ts";

/**
 * POST /api/sync/lock — pose les pronostics par défaut sur les journées
 * dont l'heure de verrouillage est passée.
 *
 * Cette route existe parce qu'elle manquait. Tout le reste était écrit : le
 * barème active le pronostic par défaut, le calcul des points sait noter un
 * pronostic automatique, les statistiques les comptent — mais rien ne les
 * créait jamais. Un joueur qui oublie marquait zéro, en silence.
 *
 * L'opération est rejouable : relancée deux fois, elle ne crée rien de plus.
 * C'est ce qui permet au planificateur de l'appeler à chaque passage sans
 * précaution particulière.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = checkSyncSecret(request);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  try {
    const admin = createAdminClient();
    const reports = await applyDefaultPredictionsForDueRounds(admin);

    const created = reports.reduce((sum, r) => sum + r.created, 0);
    const rounds = reports.filter((r) => !r.skipped).length;

    return NextResponse.json({
      ok: true,
      roundsProcessed: rounds,
      predictionsCreated: created,
      reports,
    });
  } catch (error) {
    console.error("[sync/lock]", error);
    return NextResponse.json({ error: "Échec du verrouillage." }, { status: 500 });
  }
}
