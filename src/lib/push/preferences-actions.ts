"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadSettings, setting } from "@/lib/settings";
import { settableKinds, type CatalogEntry } from "./preferences.ts";

/**
 * Enregistrement des préférences de notification d'un joueur.
 *
 * Écrit avec le client soumis à RLS, jamais avec la clé de service : la
 * politique `notif_prefs_own` (`user_id = auth.uid()`) est ce qui garantit
 * qu'un joueur ne règle que ses propres notifications. L'écran ne fait que
 * proposer — c'est la base qui refuse.
 *
 * Les types acceptés sont ceux du catalogue, relu côté serveur : un `kind`
 * inventé dans le formulaire n'écrit rien (règle n° 7 — toute entrée est
 * validée côté serveur, même si l'écran la valide déjà).
 */

export interface PreferencesState {
  status: "idle" | "success" | "error";
  message?: string;
}

export const PREFERENCES_IDLE: PreferencesState = { status: "idle" };

/** Les cases cochées arrivent en `on` ; les décochées n'arrivent pas du tout. */
const FormSchema = z.object({
  kinds: z.array(z.string().min(1).max(64)),
  enabled: z.array(z.string().min(1).max(64)),
});

export async function saveNotificationPreferences(
  _prev: PreferencesState,
  formData: FormData,
): Promise<PreferencesState> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { status: "error", message: "Session expirée." };

  const parsed = FormSchema.safeParse({
    kinds: formData.getAll("kind").map(String),
    enabled: formData.getAll("enabled").map(String),
  });
  if (!parsed.success) {
    return { status: "error", message: "Réglages illisibles." };
  }

  // Le catalogue fait foi : on n'écrit que des types réellement déclarés et
  // branchés, quoi qu'ait envoyé le navigateur.
  const settings = await loadSettings(sb);
  const catalog = setting<CatalogEntry[]>(settings, "notifications.types", []);
  const allowed = new Set(settableKinds(catalog));

  const wanted = new Set(parsed.data.enabled.filter((k) => allowed.has(k)));
  const rows = parsed.data.kinds
    .filter((kind) => allowed.has(kind))
    .map((kind) => ({
      user_id: user.id,
      kind,
      channel: "push",
      is_enabled: wanted.has(kind),
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) {
    return { status: "error", message: "Aucun réglage à enregistrer." };
  }

  // Clé primaire (user_id, kind, channel) : rejouer l'enregistrement écrase
  // proprement au lieu d'empiler des lignes.
  const { error } = await sb
    .from("notification_preferences")
    .upsert(rows, { onConflict: "user_id,kind,channel" });

  if (error) {
    return { status: "error", message: "Enregistrement refusé." };
  }

  revalidatePath("/reglages");

  const coupes = rows.filter((r) => !r.is_enabled).length;
  return {
    status: "success",
    message:
      coupes === 0
        ? "Tout est activé."
        : `Enregistré — ${coupes} type${coupes > 1 ? "s" : ""} coupé${coupes > 1 ? "s" : ""}.`,
  };
}
