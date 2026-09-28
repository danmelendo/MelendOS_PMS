import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { DEMO_ACCESS } from "@/lib/demo-access";
import { useStaffHotelModules } from "@/lib/features";
import { useRoles } from "@/lib/roles";
import { ROLE_LABELS, useStaff, useTeamActions, type StaffMember } from "@/lib/team";

export const Route = createFileRoute("/_app/team")({
  component: TeamPage,
});

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
    : "nunca";

function TeamPage() {
  const { isAdmin, loading } = useRoles();
  const { data: hotels } = useStaffHotelModules();
  const [hotel, setHotel] = useState<string | null>(null);
  useEffect(() => {
    if (!hotel && hotels?.length) setHotel(hotels[0].id);
  }, [hotel, hotels]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/today" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Users className="h-5 w-5 text-info" /> Equipo
          </h1>
          <p className="text-sm text-muted-foreground">
            Quién entra al panel de cada hotel y con qué permisos.
          </p>
        </div>
        {hotels && hotels.length > 1 && (
          <Select value={hotel ?? undefined} onValueChange={setHotel}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {hotels.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {hotel && <Team key={hotel} tenantId={hotel} />}
    </div>
  );
}

function Team({ tenantId }: { tenantId: string }) {
  const { user } = useAuth();
  const { data: staff, error } = useStaff(tenantId);
  const actions = useTeamActions(tenantId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "reception">("reception");
  const [confirming, setConfirming] = useState<string | null>(null);

  if (error) return <p className="text-sm text-destructive">{error.message}</p>;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" /> Invitar a alguien
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {DEMO_ACCESS
              ? "En la demo se crea la cuenta sin enviar ningún email."
              : "Le llegará un email para elegir su contraseña. Si ya tiene cuenta (por ejemplo, de otro hotel del grupo), se añade directamente."}
          </p>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              actions.invite.mutate(
                { email: email.trim(), role },
                {
                  onSuccess: (r) => {
                    toast.success(r.invited ? "Invitación enviada" : "Añadido al equipo");
                    setEmail("");
                  },
                  onError: (e) => toast.error(e.message),
                },
              );
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@tuhotel.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "admin" | "reception")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reception">Recepción</SelectItem>
                  <SelectItem value="admin">Dirección</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={actions.invite.isPending}>
              {actions.invite.isPending ? "Invitando…" : "Invitar"}
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Recepción gestiona reservas, llegadas, mensajes y cuentas. Dirección, además, tarifas,
            configuración, informes y datos sensibles de los clientes.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="p-3 text-left">Persona</th>
                  <th className="p-3 text-left">Rol</th>
                  <th className="p-3 text-left">Último acceso</th>
                  <th className="p-3 text-right" />
                </tr>
              </thead>
              <tbody>
                {(staff ?? []).map((m) => (
                  <Row
                    key={m.user_id}
                    member={m}
                    self={m.user_id === user?.id}
                    confirming={confirming === m.user_id}
                    onConfirm={(v) => setConfirming(v ? m.user_id : null)}
                    onRole={(r) =>
                      actions.setRole.mutate(
                        { userId: m.user_id, role: r },
                        {
                          onSuccess: () => toast.success("Rol cambiado"),
                          onError: (e) => toast.error(e.message),
                        },
                      )
                    }
                    onRemove={() =>
                      actions.remove.mutate(m.user_id, {
                        onSuccess: () => toast.success("Quitado del equipo"),
                        onError: (e) => toast.error(e.message),
                        onSettled: () => setConfirming(null),
                      })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Row({
  member: m,
  self,
  confirming,
  onConfirm,
  onRole,
  onRemove,
}: {
  member: StaffMember;
  self: boolean;
  confirming: boolean;
  onConfirm: (v: boolean) => void;
  onRole: (r: "admin" | "reception") => void;
  onRemove: () => void;
}) {
  const group = m.role === "group";
  return (
    <tr className="border-b last:border-0">
      <td className="p-3">
        <span className="font-medium">{m.email}</span>
        {self && <span className="ml-1.5 text-xs text-muted-foreground">(tú)</span>}
        <span className="block text-xs text-muted-foreground">desde {fmt(m.created_at)}</span>
      </td>
      <td className="p-3">
        {group || self ? (
          <span>{ROLE_LABELS[m.role]}</span>
        ) : (
          <Select value={m.role} onValueChange={(v) => onRole(v as "admin" | "reception")}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="reception">Recepción</SelectItem>
              <SelectItem value="admin">Dirección</SelectItem>
            </SelectContent>
          </Select>
        )}
      </td>
      <td className="p-3 text-muted-foreground">{fmt(m.last_sign_in_at)}</td>
      <td className="p-3 text-right">
        {group || self ? null : confirming ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-xs">¿Quitar el acceso?</span>
            <Button size="sm" variant="destructive" onClick={onRemove}>
              Quitar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onConfirm(false)}>
              No
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            title="Quitar del equipo"
            onClick={() => onConfirm(true)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </td>
    </tr>
  );
}
