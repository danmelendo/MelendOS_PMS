// Data client entry point. Exposes a single `supabase` instance that the whole
// app imports. When real Supabase credentials are present it returns the genuine
// client; otherwise it falls back to the in-browser demo mock (see IS_DEMO).
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { createMockClient } from "@/integrations/demo/mock-client";

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

// DEMO MODE: when no Supabase credentials are configured, the app runs against
// an in-browser mock backend (see src/integrations/demo/) so it can be explored
// with no server, database or keys. Provide real VITE_SUPABASE_* env vars to
// connect a genuine Supabase project instead.
const { SUPABASE_URL, SUPABASE_ANON_KEY } = getEnv();
export const IS_DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;
/** Base URL of the Edge Functions (null in the backend-free demo). */
export const FUNCTIONS_URL = IS_DEMO ? null : `${SUPABASE_URL}/functions/v1`;

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
  if (IS_DEMO) {
    if (typeof console !== "undefined") {
      console.info("[Demo] Sin credenciales Supabase: usando backend simulado en memoria.");
    }
    return createMockClient() as unknown as ReturnType<typeof createRealClient>;
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
