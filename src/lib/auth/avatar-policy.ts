import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSettings, setting } from "@/lib/settings";
import {
  FALLBACK_ALLOWED_MIME,
  FALLBACK_DEFAULT_EMOJI,
  FALLBACK_EMOJIS,
  FALLBACK_MAX_BYTES,
  type AvatarPolicy,
  type ClubAvatar,
} from "@/lib/auth/avatars";

/**
 * Chantier A — ce que la base a à dire sur les avatars.
 *
 * Rien n'est codé en dur : la taille maximale, les types acceptés et la palette
 * d'emojis vivent dans `app_settings` (migration 0010) et se modifient depuis
 * l'espace admin. Le bucket Storage dérive ses propres limites des deux
 * premières valeurs : une seule source de vérité, pas deux qui divergent.
 */
export async function loadAvatarPolicy(sb: SupabaseClient): Promise<AvatarPolicy> {
  const settings = await loadSettings(sb);
  return {
    maxBytes: setting<number>(settings, "avatar.max_bytes", FALLBACK_MAX_BYTES),
    allowedMime: setting<string[]>(settings, "avatar.allowed_mime", [...FALLBACK_ALLOWED_MIME]),
    emojis: setting<string[]>(settings, "avatar.emoji_choices", [...FALLBACK_EMOJIS]),
    defaultKind: setting<AvatarPolicy["defaultKind"]>(settings, "avatar.default_kind", "emoji"),
    defaultValue: setting<string>(settings, "avatar.default_value", FALLBACK_DEFAULT_EMOJI),
  };
}

/** Les clubs proposés en avatar viennent de `teams`, jamais d'une liste en dur. */
export async function loadClubAvatars(sb: SupabaseClient): Promise<ClubAvatar[]> {
  const { data, error } = await sb
    .from("teams")
    .select("code, short_name, logo_url")
    .not("logo_url", "is", null)
    .order("short_name");
  if (error) throw error;

  return (data ?? []).map((t) => ({
    code: t.code as string,
    name: t.short_name as string,
    logoUrl: t.logo_url as string,
  }));
}
