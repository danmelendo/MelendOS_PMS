import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { IS_DEMO } from "@/integrations/supabase/client";
import { resetDemoDb } from "@/integrations/demo/seed";

// Thin, dismissible banner shown only when the app runs against the in-browser
// mock backend (no Supabase credentials configured). Makes it obvious that data
// is simulated and lets the visitor reset it to the seeded state.
//
// Responsive: on narrow screens the long description is hidden (kept for screen
// readers) so the pill never overflows the viewport; on the mobile app it floats
// just above the bottom tab bar instead of at the very bottom.
export function DemoBanner() {
  const [hidden, setHidden] = useState(false);
  const path = useRouterState({ select: (r) => r.location.pathname });
  if (!IS_DEMO || hidden) return null;

  const onMobileApp = path.startsWith("/stays");

  return (
    <>
      <style>{BANNER_CSS}</style>
      <div className={`demo-banner${onMobileApp ? " demo-banner--mobile" : ""}`}>
        <span className="demo-banner__msg">
          <span aria-hidden className="demo-banner__icon">
            🧪
          </span>
          <span className="demo-banner__short">Modo demo</span>
          <span className="demo-banner__full">
            Modo demo · datos simulados en tu navegador, sin backend.
          </span>
        </span>
        <button
          onClick={() => {
            resetDemoDb();
            window.location.reload();
          }}
          className="demo-banner__btn"
          title="Restaurar los datos de ejemplo"
        >
          Reiniciar datos
        </button>
        <button
          onClick={() => setHidden(true)}
          className="demo-banner__btn demo-banner__btn--close"
          aria-label="Ocultar aviso"
        >
          ✕
        </button>
      </div>
    </>
  );
}

const BANNER_CSS = `
  .demo-banner {
    position: fixed;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 40; /* below dialogs and drawers (z-50) */
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: calc(100vw - 16px);
    padding: 8px 12px;
    border-radius: 0;
    background: rgba(14, 30, 61, 0.92);
    color: #fff;
    font-size: 12.5px;
    font-family: system-ui, sans-serif;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
    backdrop-filter: blur(4px);
  }
  .demo-banner--mobile { bottom: 80px; }
  .demo-banner__msg { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
  .demo-banner__icon { font-size: 14px; flex-shrink: 0; }
  .demo-banner__short { display: none; }
  .demo-banner__full { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .demo-banner__btn {
    background: rgba(255, 255, 255, 0.14);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 0;
    padding: 4px 11px;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .demo-banner__btn--close { padding: 4px 9px; }

  /* Narrow screens: collapse to a compact pill that can't overflow. */
  @media (max-width: 480px) {
    .demo-banner { gap: 8px; padding: 7px 10px; font-size: 12px; }
    .demo-banner__short { display: inline; }
    .demo-banner__full { display: none; }
    .demo-banner__btn { padding: 5px 10px; }
  }
`;
