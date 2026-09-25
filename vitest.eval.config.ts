import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Agent evals: real model + demo database. Run on demand (npm run eval:agent),
// not in CI: they need a model endpoint and take minutes.
export default defineConfig({
  resolve: { alias: { "npm:@supabase/supabase-js@2": "@supabase/supabase-js" } },
  test: {
    environment: "node",
    include: ["supabase/evals/**/*.eval.ts"],
    env: { ...loadEnv("", process.cwd(), ""), ...(process.env as Record<string, string>) },
    testTimeout: 20 * 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
