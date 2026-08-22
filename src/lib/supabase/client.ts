import { createBrowserClient } from "@supabase/ssr";

/** Client navigateur. Ne voit que ce que les politiques RLS autorisent. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
