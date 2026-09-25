import { createFileRoute } from "@tanstack/react-router";
import {
  UserRound,
  Mail,
  Phone,
  BadgeCheck,
  RotateCcw,
  Building2,
  Plug,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { useMember } from "@/lib/member-session";
import { pms } from "@/integrations/pms";
import { resetDemoDb } from "@/integrations/demo/seed";

export const Route = createFileRoute("/stays/account")({
  component: AccountScreen,
});

function AccountScreen() {
  const { member } = useMember();

  const resetData = () => {
    resetDemoDb();
    toast.success("Datos de la demo reiniciados");
    setTimeout(() => window.location.reload(), 600);
  };

  return (
    <div className="px-5 pt-6">
      <h1 className="mb-4 flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <UserRound className="h-6 w-6 text-[var(--brand)]" /> Mi cuenta
      </h1>

      <div className=" bg-white p-5 text-center shadow-sm ring-1 ring-neutral-100">
        <div className="mx-auto flex h-16 w-16 items-center justify-center  bg-[var(--brand)] text-2xl font-semibold text-white">
          {member?.name.charAt(0) ?? "S"}
        </div>
        <h2 className="mt-3 text-lg font-semibold">{member?.name ?? "Socio Stays"}</h2>
        <p className="flex items-center justify-center gap-1 text-sm text-[var(--brand)]">
          <BadgeCheck className="h-4 w-4" /> {member?.memberNumber}
        </p>
      </div>

      <div className="mt-3 space-y-px overflow-hidden  bg-white shadow-sm ring-1 ring-neutral-100">
        <Item icon={Mail} label="Email" value={member?.email ?? "—"} />
        <Item icon={Phone} label="Teléfono" value={member?.phone ?? "—"} />
      </div>

      {/* Integration narrative */}
      <div className="mt-3  bg-white p-4 shadow-sm ring-1 ring-neutral-100">
        <p className="flex items-center gap-2 text-sm font-medium text-neutral-700">
          <Plug className="h-4 w-4 text-emerald-600" /> PMS conectado
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          Esta app es un producto independiente que se integra con cualquier PMS por API. Ahora
          mismo está conectada a <span className="font-medium text-neutral-700">{pms.pmsName}</span>{" "}
          como PMS de prueba.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/web"
            className="inline-flex items-center gap-2  bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
          >
            <Globe className="h-4 w-4" /> Web pública
          </a>
          <a
            href="/today"
            className="inline-flex items-center gap-2  bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
          >
            <Building2 className="h-4 w-4" /> Panel del PMS
          </a>
        </div>
      </div>

      <button
        onClick={resetData}
        className="mt-4 flex w-full items-center justify-center gap-2  border border-neutral-200 bg-white py-3 text-sm font-medium text-neutral-600"
      >
        <RotateCcw className="h-4 w-4" /> Reiniciar datos de la demo
      </button>

      <p className="mt-4 pb-2 text-center text-[11px] text-neutral-400">
        Demo · datos en tu navegador (localStorage)
      </p>
    </div>
  );
}

function Item({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="h-4 w-4 text-neutral-400" />
      <span className="text-sm text-neutral-500">{label}</span>
      <span className="ml-auto text-sm font-medium text-neutral-800">{value}</span>
    </div>
  );
}
