// ─────────────────────────────────────────────────────────────────────────────
// CMS client — the swap point.
//
// The "Experiencias" sections import `cms` from here. Today it resolves to the demo
// CMS; to use a real headless CMS implement `CmsClient` against its API and
// assign it here. No UI changes needed.
//
//   import { cms } from "@/integrations/cms";
//
// ─────────────────────────────────────────────────────────────────────────────

import { IS_DEMO } from "@/integrations/supabase/client";
import { DemoCmsClient } from "./demo-cms-client";
import { SupabaseCmsClient } from "./supabase-cms-client";
import type { CmsClient } from "./client";

// Backend-free demo: in-memory agenda. Real backend: the experiences table.
export const cms: CmsClient = IS_DEMO ? new DemoCmsClient() : new SupabaseCmsClient();

export type { CmsClient } from "./client";
export * from "./types";
