import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client de service : contourne RLS.
 *
 * ⚠️ Serveur uniquement. Réservé à ce que seul le serveur a le droit de faire :
 * écrire les points, appliquer un résultat, poser un prono par défaut, écrire
 * dans admin_actions. Ne jamais l'appeler depuis un composant client.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante côté serveur.");

  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
