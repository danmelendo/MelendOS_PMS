import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Eye, IdCard, Lock, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  confirmIdentity,
  DOCUMENT_TYPES,
  fetchIdentity,
  useSaveIdentity,
  type CustomerRow,
  type GuestIdentity,
} from "@/lib/customers";
import { eur } from "@/lib/data";
import { DEMO_ACCESS } from "@/lib/demo-access";
import { useRoles } from "@/lib/roles";

const day = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
    : "—";

/** Sensitive data stays on screen this long, then hides again. */
const REVEAL_MS = 2 * 60_000;

const EMPTY: GuestIdentity = {
  document_type: "dni",
  document_number: "",
  document_country: "ES",
  nationality: "ES",
  birth_date: null,
  address_line: null,
  postal_code: null,
  city: null,
  country: "ES",
};

/** Customer file: contact, stays and the traveller register (sensitive). */
export function CustomerDrawer({
  customer,
  hotelName,
  onOpenChange,
}: {
  customer: CustomerRow | null;
  hotelName?: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogPrimitive.Root open={!!customer} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="drawer-overlay fixed inset-0 z-50 bg-primary/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="drawer-panel fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col bg-background shadow-2xl outline-none sm:border-l"
        >
          {customer && <Body key={customer.id} customer={customer} hotelName={hotelName} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Body({ customer: c, hotelName }: { customer: CustomerRow; hotelName?: string }) {
  return (
    <>
      <header className="flex items-start gap-3 border-b px-5 py-4">
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="truncate text-lg font-semibold">
            {c.name ?? "Sin nombre"}
          </DialogPrimitive.Title>
          <p className="text-sm text-muted-foreground">
            {hotelName ?? ""} · cliente desde {day(c.created_at)}
          </p>
        </div>
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </DialogPrimitive.Close>
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4 text-sm">
        <section className="grid grid-cols-2 gap-3">
          <Fact label="Email" value={c.email ?? "—"} />
          <Fact label="Teléfono" value={c.phone ?? "—"} />
          <Fact label="Estancias" value={String(c.stays)} />
          <Fact label="Noches" value={String(c.nights)} />
          <Fact label="Gastado" value={eur(Number(c.spent))} />
          <Fact
            label={c.in_house ? "Estado" : "Próxima llegada"}
            value={c.in_house ? "Alojado ahora" : day(c.next_check_in)}
          />
          <Fact label="Última salida" value={day(c.last_check_out)} />
          <Fact label="Comunicaciones" value={c.no_contact ? "No desea" : "Acepta"} />
        </section>
        {c.notes && (
          <section>
            <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Notas
            </h3>
            <p className="whitespace-pre-line">{c.notes}</p>
          </section>
        )}
        <IdentitySection customer={c} />
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate font-medium">{value}</div>
    </div>
  );
}

// Traveller register. Reception records it and cannot read it back; admins
// see it after signing in again, for a couple of minutes.
function IdentitySection({ customer }: { customer: CustomerRow }) {
  const { isAdmin } = useRoles();
  const { user } = useAuth();
  const [mode, setMode] = useState<"idle" | "confirm" | "shown" | "edit">("idle");
  const [identity, setIdentity] = useState<GuestIdentity | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Hide again after a while (the server also refuses stale sign-ins).
  useEffect(() => {
    if (mode !== "shown") return;
    const t = setTimeout(() => {
      setIdentity(null);
      setMode("idle");
    }, REVEAL_MS);
    return () => clearTimeout(t);
  }, [mode]);

  const reveal = async (again = false) => {
    setBusy(true);
    try {
      if (again) await confirmIdentity(user?.email ?? "", password);
      setIdentity(await fetchIdentity(customer.id));
      setMode("shown");
      setPassword("");
    } catch (e) {
      const msg = (e as Error).message;
      if (!again && /identificarte/.test(msg)) setMode("confirm");
      else toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border p-4">
      <h3 className="flex items-center gap-2 font-medium">
        <IdCard className="h-4 w-4 text-info" /> Registro de viajero
        {customer.has_identity ? (
          <span className="ml-auto rounded bg-info/10 px-2 py-0.5 text-xs text-info">
            Documento registrado
          </span>
        ) : (
          <span className="ml-auto rounded bg-gold/15 px-2 py-0.5 text-xs text-gold">
            Pendiente
          </span>
        )}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Documento, nacionalidad, fecha de nacimiento y domicilio. Solo dirección puede verlos, tras
        volver a identificarse; cada consulta queda registrada.
      </p>

      {mode === "edit" ? (
        <IdentityForm
          customerId={customer.id}
          initial={identity ?? EMPTY}
          onDone={() => {
            setIdentity(null);
            setMode("idle");
          }}
        />
      ) : mode === "confirm" ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            reveal(true);
          }}
        >
          <p className="flex items-center gap-1.5 font-medium">
            <Lock className="h-3.5 w-3.5" /> Confirma que eres tú
          </p>
          {DEMO_ACCESS ? (
            <p className="text-xs text-muted-foreground">
              En la demo se vuelve a entrar con la cuenta de demostración; en producción se pide la
              contraseña.
            </p>
          ) : (
            <Input
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder="Tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || (!DEMO_ACCESS && !password)}>
              Confirmar y ver
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
              Volver
            </Button>
          </div>
        </form>
      ) : mode === "shown" ? (
        <div className="mt-3 space-y-3">
          {identity ? (
            <dl className="grid grid-cols-2 gap-3">
              <Fact
                label={DOCUMENT_TYPES[identity.document_type]}
                value={`${identity.document_number}${identity.document_country ? ` (${identity.document_country})` : ""}`}
              />
              <Fact label="Nacionalidad" value={identity.nationality ?? "—"} />
              <Fact label="Fecha de nacimiento" value={day(identity.birth_date)} />
              <Fact
                label="Domicilio"
                value={
                  [identity.address_line, identity.postal_code, identity.city, identity.country]
                    .filter(Boolean)
                    .join(", ") || "—"
                }
              />
            </dl>
          ) : (
            <p className="text-muted-foreground">Sin datos registrados.</p>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setMode("edit")}>
              Corregir
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setIdentity(null);
                setMode("idle");
              }}
            >
              Ocultar
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {isAdmin && customer.has_identity && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => reveal()}>
              <Eye className="mr-1 h-3.5 w-3.5" /> Ver datos de identidad
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setMode("edit")}>
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            {customer.has_identity ? "Registrar de nuevo" : "Registrar documento"}
          </Button>
        </div>
      )}
    </section>
  );
}

function IdentityForm({
  customerId,
  initial,
  onDone,
}: {
  customerId: string;
  initial: GuestIdentity;
  onDone: () => void;
}) {
  const [f, setF] = useState<GuestIdentity>(initial);
  const save = useSaveIdentity(customerId);
  const set = (k: keyof GuestIdentity) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value || null }));
  const upper = (k: keyof GuestIdentity) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value.toUpperCase() || null }));

  return (
    <form
      className="mt-3 grid grid-cols-2 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(f, {
          onSuccess: () => {
            toast.success("Registro de viajero guardado");
            onDone();
          },
          onError: (err) => toast.error(err.message),
        });
      }}
    >
      <div className="space-y-1">
        <Label>Documento</Label>
        <Select
          value={f.document_type}
          onValueChange={(v) =>
            setF((x) => ({ ...x, document_type: v as GuestIdentity["document_type"] }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(DOCUMENT_TYPES).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="id-number">Número</Label>
        <Input
          id="id-number"
          required
          minLength={3}
          maxLength={30}
          value={f.document_number}
          onChange={(e) => setF((x) => ({ ...x, document_number: e.target.value.toUpperCase() }))}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="id-nat">Nacionalidad (país, 2 letras)</Label>
        <Input
          id="id-nat"
          maxLength={2}
          value={f.nationality ?? ""}
          onChange={upper("nationality")}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="id-birth">Fecha de nacimiento</Label>
        <Input id="id-birth" type="date" value={f.birth_date ?? ""} onChange={set("birth_date")} />
      </div>
      <div className="col-span-2 space-y-1">
        <Label htmlFor="id-address">Domicilio</Label>
        <Input
          id="id-address"
          maxLength={200}
          value={f.address_line ?? ""}
          onChange={set("address_line")}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="id-cp">Código postal</Label>
        <Input
          id="id-cp"
          maxLength={12}
          value={f.postal_code ?? ""}
          onChange={set("postal_code")}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="id-city">Ciudad</Label>
        <Input id="id-city" maxLength={100} value={f.city ?? ""} onChange={set("city")} />
      </div>
      <div className="col-span-2 flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending || f.document_number.length < 3}>
          Guardar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
