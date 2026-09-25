import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Database tests (RLS and SQL rules). They need SUPABASE_DB_URL (from .env or
// the environment) and run inside a transaction that is always rolled back.
export default defineConfig({
  test: {
    environment: "node",
    include: ["supabase/tests/**/*.test.ts"],
    // Values already in the environment (e.g. CI secrets) win over .env.
    env: { ...loadEnv("", process.cwd(), ""), ...(process.env as Record<string, string>) },
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
