import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { isPanelHost } from "@/lib/runtime-config";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { session, loading } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    );
  // The panel's own address opens the sign-in; any other, the hotel's web.
  if (session) return <Navigate to="/today" />;
  return <Navigate to={isPanelHost() ? "/login" : "/web"} />;
}
