import type { ReactNode } from "react";
import { LifeBuoy, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useRoles } from "@/lib/roles";
import { t } from "@/lib/i18n";

/**
 * Page guard for the sidebar sections: «Configuración» is for hotel management
 * (and Melend/OS support); «Administrar y configuración» only for Melend/OS
 * support. The database still checks every write; this keeps the pages out of
 * reach of people who should not use them, even by typing the URL.
 */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useRoles();
  if (loading) return null;
  if (!isAdmin)
    return (
      <Notice icon={Lock} title={t("Solo para dirección")}>
        {t("Esta configuración la gestiona la dirección del hotel.")}
      </Notice>
    );
  return <>{children}</>;
}

export function PlatformOnly({ children }: { children: ReactNode }) {
  const { isPlatform, loading } = useRoles();
  if (loading) return null;
  if (!isPlatform)
    return (
      <Notice icon={LifeBuoy} title={t("Lo configura el equipo de Melend/OS")}>
        {t(
          "Esta sección la gestiona el soporte de Melend/OS. Si necesitas un cambio, escríbenos y lo hacemos por ti.",
        )}
      </Notice>
    );
  return <>{children}</>;
}

function Notice({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Lock;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-6">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-info" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">{title}</p>
          <p className="text-muted-foreground">{children}</p>
        </div>
      </CardContent>
    </Card>
  );
}
