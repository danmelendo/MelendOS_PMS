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

import { DemoCmsClient } from "./demo-cms-client";
import type { CmsClient } from "./client";

export const cms: CmsClient = new DemoCmsClient();

export type { CmsClient } from "./client";
export * from "./types";
