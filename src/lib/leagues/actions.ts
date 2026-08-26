"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin/log";
import { type ActionState, failure, success } from "@/lib/auth/action-state";
import { requireLeagueAdmin, LeagueError } from "./auth.ts";
import { generateJoinKey } from "./keys.ts";

/**
 * Écriture des ligues.
 *
 * Même patron que `groups.invite_code` au signup (`src/lib/auth/actions.ts`) :
 * la recherche par clé passe par le client de service, parce que RLS réserve
 * `leagues` à ses membres — et on ne l'est justement pas encore avant de la
 * rejoindre. Toute entrée est validée par Zod côté serveur (règle n° 7),
 * même si l'écran valide déjà.
 */

const MAX_RETRIES = 3;

async function insertWithFreshKey<T>(
  admin: ReturnType<typeof createAdminClient>,
  insert: (key: string) => PromiseLike<{ data: T | null; error: { code?: string } | null }>,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { data, error } = await insert(generateJoinKey());
    if (!error) return data as T;
    if (error.code !== "23505") throw error;
    // 23505 : collision sur join_key, un tirage sur ~1 milliard — on retire.
  }
  throw new Error("Impossible de générer une clé de ligue disponible.");
}

/* ==========================================================================
   REJOINDRE
   ========================================================================== */

const joinSchema = z.object({
  joinKey: z.string().trim().min(1, "Entre la clé de ta ligue.").max(32),
});

export async function joinLeagueByKey(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = joinSchema.safeParse({ joinKey: formData.get("joinKey") });
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Clé invalide.");
  }

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return failure("Connexion requise.");

  const admin = createAdminClient();

  const { data: league, error: leagueError } = await admin
    .from("leagues")
    .select("id, name")
    .eq("join_key", parsed.data.joinKey)
    .maybeSingle();
  if (leagueError) return failure("Impossible de vérifier cette clé pour le moment.");
  if (!league) {
    return failure("Cette clé ne correspond à aucune ligue.", {
      joinKey: ["Cette clé ne correspond à aucune ligue."],
    });
  }

  const { data: existing } = await admin
    .from("league_members")
    .select("user_id")
    .eq("league_id", league.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) {
    return success(`Tu es déjà dans la ligue « ${league.name} ».`);
  }

  const { error: joinError } = await admin.from("league_members").insert({
    league_id: league.id,
    user_id: user.id,
    role: "player",
  });
  if (joinError) return failure("Impossible de rejoindre cette ligue pour le moment.");

  revalidatePath("/accueil");
  return success(`Bienvenue dans « ${league.name} » !`);
}

/* ==========================================================================
   CRÉER
   ========================================================================== */

const createSchema = z.object({
  competitionCode: z.string().min(1, "Choisis une compétition."),
  name: z.string().trim().min(1, "Le nom de la ligue est obligatoire.").max(80),
  logoUrl: z.string().trim().url("Adresse de logo invalide.").max(500).optional().or(z.literal("")),
  slogan: z.string().trim().max(140).optional().or(z.literal("")),
});

export interface CreateLeagueResult {
  id: string;
  name: string;
  joinKey: string;
}

export async function createLeague(
  input: unknown,
): Promise<{ ok: true; league: CreateLeagueResult } | { ok: false; message: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, message: "Connexion requise." };

  const admin = createAdminClient();

  const { data: competition, error: competitionError } = await admin
    .from("competitions")
    .select("id")
    .eq("code", parsed.data.competitionCode)
    .eq("is_active", true)
    .maybeSingle();
  if (competitionError || !competition) {
    return { ok: false, message: "Cette compétition n'est pas encore jouable." };
  }

  try {
    const league = await insertWithFreshKey<{ id: string; name: string; join_key: string }>(admin, (joinKey) =>
      admin
        .from("leagues")
        .insert({
          competition_id: competition.id,
          name: parsed.data.name,
          logo_url: parsed.data.logoUrl || null,
          slogan: parsed.data.slogan || null,
          join_key: joinKey,
          created_by: user.id,
        })
        .select("id, name, join_key")
        .single(),
    );

    const { error: memberError } = await admin.from("league_members").insert({
      league_id: league.id,
      user_id: user.id,
      role: "admin",
    });
    if (memberError) throw memberError;

    await logAdminAction(admin, {
      adminId: user.id,
      action: "league.created",
      entityType: "league",
      entityId: league.id,
      reason: `Création de la ligue « ${league.name} »`,
      after: { name: league.name },
    });

    revalidatePath("/accueil");
    return {
      ok: true,
      league: { id: league.id, name: league.name, joinKey: league.join_key },
    };
  } catch {
    return { ok: false, message: "La création de la ligue a échoué. Réessaie dans un instant." };
  }
}

/* ==========================================================================
   ADMINISTRATION D'UNE LIGUE
   ========================================================================== */

function handle(error: unknown): ActionState {
  if (error instanceof LeagueError) return failure(error.message);
  console.error("[leagues]", error);
  return failure("L'action a échoué. Réessaie dans un instant.");
}

const updateSchema = z.object({
  leagueId: z.string().uuid(),
  name: z.string().trim().min(1, "Le nom de la ligue est obligatoire.").max(80),
  logoUrl: z.string().trim().url("Adresse de logo invalide.").max(500).optional().or(z.literal("")),
  slogan: z.string().trim().max(140).optional().or(z.literal("")),
});

export async function updateLeague(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const parsed = updateSchema.safeParse({
      leagueId: formData.get("leagueId"),
      name: formData.get("name"),
      logoUrl: formData.get("logoUrl"),
      slogan: formData.get("slogan"),
    });
    if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Formulaire invalide.");

    const ctx = await requireLeagueAdmin(parsed.data.leagueId);
    const admin = createAdminClient();

    const { data: before } = await admin
      .from("leagues")
      .select("name, logo_url, slogan")
      .eq("id", ctx.leagueId)
      .single();

    const { error } = await admin
      .from("leagues")
      .update({
        name: parsed.data.name,
        logo_url: parsed.data.logoUrl || null,
        slogan: parsed.data.slogan || null,
      })
      .eq("id", ctx.leagueId);
    if (error) throw error;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "league.updated",
      entityType: "league",
      entityId: ctx.leagueId,
      reason: "Informations de la ligue modifiées",
      before,
      after: { name: parsed.data.name, logo_url: parsed.data.logoUrl || null, slogan: parsed.data.slogan || null },
    });

    revalidatePath("/ligue");
    return success("Ligue mise à jour.");
  } catch (error) {
    return handle(error);
  }
}

const leagueIdSchema = z.object({ leagueId: z.string().uuid() });

export async function regenerateJoinKey(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const parsed = leagueIdSchema.safeParse({ leagueId: formData.get("leagueId") });
    if (!parsed.success) return failure("Ligue invalide.");

    const ctx = await requireLeagueAdmin(parsed.data.leagueId);
    const admin = createAdminClient();

    await insertWithFreshKey(admin, (joinKey) =>
      admin.from("leagues").update({ join_key: joinKey }).eq("id", ctx.leagueId).select("id").single(),
    );

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "league.join_key_regenerated",
      entityType: "league",
      entityId: ctx.leagueId,
      reason: "Nouvelle clé de ligue générée",
    });

    revalidatePath("/ligue");
    return success("Nouvelle clé générée.");
  } catch (error) {
    return handle(error);
  }
}

const memberRoleSchema = z.object({
  leagueId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["admin", "player"]),
});

export async function setLeagueMemberRole(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const parsed = memberRoleSchema.safeParse({
      leagueId: formData.get("leagueId"),
      userId: formData.get("userId"),
      role: formData.get("role"),
    });
    if (!parsed.success) return failure("Requête invalide.");

    const ctx = await requireLeagueAdmin(parsed.data.leagueId);
    const admin = createAdminClient();

    if (parsed.data.userId === ctx.userId && parsed.data.role === "player") {
      const { count } = await admin
        .from("league_members")
        .select("user_id", { count: "exact", head: true })
        .eq("league_id", ctx.leagueId)
        .eq("role", "admin");
      if ((count ?? 0) <= 1) {
        return failure("Impossible : il n'y aurait plus aucun administrateur de cette ligue.");
      }
    }

    const { error } = await admin
      .from("league_members")
      .update({ role: parsed.data.role })
      .eq("league_id", parsed.data.leagueId)
      .eq("user_id", parsed.data.userId);
    if (error) throw error;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "league.member_role_changed",
      entityType: "league",
      entityId: parsed.data.leagueId,
      reason: `Rôle changé pour ${parsed.data.userId}`,
      after: { role: parsed.data.role },
    });

    revalidatePath("/ligue");
    return success("Rôle mis à jour.");
  } catch (error) {
    return handle(error);
  }
}

export async function removeLeagueMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const parsed = z
      .object({ leagueId: z.string().uuid(), userId: z.string().uuid() })
      .safeParse({ leagueId: formData.get("leagueId"), userId: formData.get("userId") });
    if (!parsed.success) return failure("Requête invalide.");

    const ctx = await requireLeagueAdmin(parsed.data.leagueId);
    if (parsed.data.userId === ctx.userId) {
      return failure("Tu ne peux pas te retirer toi-même de la ligue.");
    }
    const admin = createAdminClient();

    const { error } = await admin
      .from("league_members")
      .delete()
      .eq("league_id", parsed.data.leagueId)
      .eq("user_id", parsed.data.userId);
    if (error) throw error;

    await logAdminAction(admin, {
      adminId: ctx.userId,
      action: "league.member_removed",
      entityType: "league",
      entityId: parsed.data.leagueId,
      reason: `Membre retiré : ${parsed.data.userId}`,
    });

    revalidatePath("/ligue");
    return success("Membre retiré de la ligue.");
  } catch (error) {
    return handle(error);
  }
}
