import { useEffect } from "react";
import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { Globe } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { CopilotWidget } from "@/components/CopilotWidget";
import { useAuth } from "@/lib/auth";
import { useRoles } from "@/lib/roles";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { session, loading } = useAuth();
  const { isGroup, canOperate } = useRoles();
  // Panel scrollbars (styles.css: html.panel).
  useEffect(() => {
    document.documentElement.classList.add("panel");
    return () => document.documentElement.classList.remove("panel");
  }, []);
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    );
  if (!session) return <Navigate to="/login" />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b px-2 gap-2 bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-auto flex items-center gap-1">
              <a
                href="/web"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
                title="Ir a la web pública Stays"
              >
                <Globe className="h-3.5 w-3.5" /> Web
              </a>
              <NotificationBell />
            </div>
          </header>
          {isGroup && !canOperate && (
            <div className="border-b bg-info/10 px-4 py-2 text-xs text-info">
              Dirección de grupo: ves y gestionas todos los hoteles del grupo, en modo consulta para
              la operativa (reservas, cobros y mensajes los lleva cada hotel).
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
