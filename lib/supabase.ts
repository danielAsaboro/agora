import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "./env";

export function browserSupabase() {
  return createBrowserClient(env.supabaseUrl(), env.supabaseAnon());
}

export async function serverSupabase() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnon(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cs) => {
        try { cs.forEach((c) => store.set(c.name, c.value, c.options)); } catch {}
      },
    },
  });
}

/** Bypasses RLS — use only from API routes / indexer */
export function serviceSupabase() {
  return createClient(env.supabaseUrl(), env.supabaseService(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
