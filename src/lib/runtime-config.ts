// Configuration read when the page loads, from /config.js, before the build's
// VITE_* values. It lets one web build serve every installation: on a VPS each
// installation generates its own config.js (deploy/vps/tools/web-config.sh);
// in the cloud public/config.js is empty and the VITE_* values apply.

export interface RuntimeConfig {
  supabaseUrl?: string;
  supabaseKey?: string;
  platformDomain?: string;
  platformCname?: string;
  demoAccess?: boolean;
  /** Host of the management panel (e.g. panel.hotelsol.es): its root opens the sign-in. */
  panelHost?: string;
}

declare global {
  interface Window {
    __MELENDOS__?: RuntimeConfig;
  }
}

export const runtimeConfig: RuntimeConfig =
  (typeof window !== "undefined" && window.__MELENDOS__) || {};

/** True on the panel's own address, where "/" is the sign-in, not the hotel's web. */
export function isPanelHost(): boolean {
  const host = runtimeConfig.panelHost?.toLowerCase();
  return !!host && typeof window !== "undefined" && window.location.hostname === host;
}
