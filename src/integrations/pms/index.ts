// ─────────────────────────────────────────────────────────────────────────────
// PMS connector — the swap point.
//
// The mobile app imports `pms` from here and nothing else. Today it resolves to
// the Demo Stays reference connector; to integrate a different PMS, implement
// `PmsConnector` against that PMS's API and assign it here. No UI changes needed.
//
//   import { pms } from "@/integrations/pms";
//
// ─────────────────────────────────────────────────────────────────────────────

import { DemoStaysConnector } from "./demo-stays-connector";
import type { PmsConnector } from "./connector";

export const pms: PmsConnector = new DemoStaysConnector();

export type { PmsConnector } from "./connector";
export * from "./types";
