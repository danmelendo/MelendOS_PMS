// Data client entry point. Exposes a single `supabase` instance that the whole
// app imports. It needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
// (see .env.example): the demo project in development and pre-production, the
// production project in production.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function getEnv() {
  const SUPABASE_URL =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_URL) ||
    (typeof process !== "undefined" ? process.env.SUPABASE_URL : undefined);
  const SUPABASE_ANON_KEY =
    (typeof import.meta !== "undefined" &&
      (import.meta.env?.VITE_SUPABASE_ANON_KEY ||
        import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY)) ||
    (typeof process !== "undefined" ? process.env.SUPABASE_PUBLISHABLE_KEY : undefined);
  return { SUPABASE_URL, SUPABASE_ANON_KEY };
}

const { SUPABASE_URL, SUPABASE_ANON_KEY } = getEnv();
/** Base URL of the Edge Functions. */
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

function createRealClient() {
  return createClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

function createSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY: copia .env.example a .env y apunta al proyecto de Supabase.",
    );
  }
  return createRealClient();
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
