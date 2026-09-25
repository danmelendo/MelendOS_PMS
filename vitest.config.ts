import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Unit tests run in plain Node: the code under test is pure domain logic, so no
// router, Tailwind or React plugins are needed here.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "supabase/functions/**/*.test.ts"],
  },
});
