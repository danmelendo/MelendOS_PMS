// ─────────────────────────────────────────────────────────────────────────────
// CMS client — the swap point.
//
// The "Experiencias" sections import `cms` from here. Today it resolves to the
// experiences table in Supabase; to use a headless CMS implement `CmsClient`
// against its API and assign it here. No UI changes needed.
//
//   import { cms } from "@/integrations/cms";
//
// ─────────────────────────────────────────────────────────────────────────────

import { SupabaseCmsClient } from "./supabase-cms-client";
import type { CmsClient } from "./client";

export const cms: CmsClient = new SupabaseCmsClient();

export type { CmsClient } from "./client";
export * from "./types";
