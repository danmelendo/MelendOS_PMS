import { useEffect, useState } from "react";
import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { Globe } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { CopilotWidget } from "@/components/CopilotWidget";
import { useAuth } from "@/lib/auth";
import { useRoles } from "@/lib/roles";
import { useAssurance } from "@/lib/mfa";
import { panelLang, setActiveLang, setPanelLang, setPanelScope, useLang, t } from "@/lib/i18n";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { session, loading } = useAuth();
  const { isGroup, canOperate, isStaff, loading: rolesLoading } = useRoles();
  const aal = useAssurance(!!session);
  // The panel in the staff member's language (Spanish by default), whatever
  // the guest web was showing in this tab.
  useState(() => {
    setPanelScope(true);
    setActiveLang(panelLang());
  });
  const { lang } = useLang();
  // Panel scrollbars (styles.css: html.panel).
  useEffect(() => {
    document.documentElement.classList.add("panel");
    return () => document.documentElement.classList.remove("panel");
  }, []);
  if (loading || (session && rolesLoading))
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        {t("Cargando…")}
      </div>
    );
  if (!session) return <Navigate to="/login" />;
  // Two-step verification on and not done in this session: the code first.
  if (aal.data?.needsCode) return <Navigate to="/login" />;
  // Only hotel staff belong in the management panel. A guest who signed in on
  // the public web (member account) has no tenant membership: send them back to
  // the web. RLS already hides every hotel's data from them; this keeps the
  // panel itself out of their reach, in the demo and in production.
  if (!isStaff) return <Navigate to="/web" />;

  return (
    // Keyed by language: switching it re-renders every text of the panel.
    <SidebarProvider key={lang}>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b px-2 gap-2 bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-auto flex items-center gap-1">
              <div
                className="mr-1 inline-flex overflow-hidden rounded-md border text-[11px] font-medium"
                role="group"
                aria-label={t("Idioma del panel")}
              >
                {(["es", "en"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setPanelLang(l)}
                    aria-pressed={lang === l}
                    className={
                      lang === l
                        ? "bg-primary px-2 py-1 text-primary-foreground"
                        : "px-2 py-1 text-muted-foreground hover:bg-accent"
                    }
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
              <a
                href="/web"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
                title={t("Ir a la web pública Stays")}
              >
                <Globe className="h-3.5 w-3.5" /> {t("Web")}
              </a>
              <NotificationBell />
            </div>
          </header>
          {isGroup && !canOperate && (
            <div className="border-b bg-info/10 px-4 py-2 text-xs text-info">
              {t(
                "Dirección de grupo: ves y gestionas todos los hoteles del grupo, en modo consulta para la operativa (reservas, cobros y mensajes los lleva cada hotel).",
              )}
            </div>
          )}
          <main className="flex-1 p-4 md:p-6 bg-muted/20">
            <Outlet />
          </main>
        </div>
      </div>
      <CopilotWidget />
    </SidebarProvider>
  );
}
