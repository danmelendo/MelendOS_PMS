import { useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Baby, Lock, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { countryOptions } from "@domain/countries.ts";
import {
  ageOn,
  DOCUMENT_TYPES,
  KINSHIPS,
  SEXES,
  travellerIssues,
  type SesTraveller,
} from "@domain/ses.ts";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { FIELD_LABELS, useStayTravellers, useTravellerActions, type TravellerRow } from "@/lib/ses";

export interface StayRef {
  id: string;
  reference: string;
  guestName: string | null;
  /** yyyy-MM-dd */
  checkIn: string;
  people: number;
}

const COUNTRIES = countryOptions("es");

/** Guests of a stay for the traveller register (SES.HOSPEDAJES). */
export function TravellersDrawer({
  stay,
  onOpenChange,
  readOnly = false,
}: {
  stay: StayRef | null;
  onOpenChange: (open: boolean) => void;
  readOnly?: boolean;
}) {
  return (
    <DialogPrimitive.Root open={!!stay} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="drawer-overlay fixed inset-0 z-50 bg-primary/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="drawer-panel fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col bg-background shadow-2xl outline-none sm:border-l"
        >
          {stay && <Body key={stay.id} stay={stay} readOnly={readOnly} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Body({ stay, readOnly }: { stay: StayRef; readOnly: boolean }) {
  const { data: travellers, isLoading } = useStayTravellers(stay.id);
  const actions = useTravellerActions(stay.id);
  const [editing, setEditing] = useState<TravellerRow | "new" | null>(null);
  const complete = (travellers ?? []).filter((t) => t.missing.length === 0).length;

  return (
    <>
      <header className="flex items-start gap-3 border-b px-5 py-4">
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="truncate text-lg font-semibold">
            Viajeros · {stay.reference}
          </DialogPrimitive.Title>
          <p className="text-sm text-muted-foreground">
            {stay.guestName ?? "Sin nombre"} · llegada{" "}
            {new Date(stay.checkIn + "T12:00:00").toLocaleDateString("es-ES", {
              day: "numeric",
              month: "short",
            })}{" "}
            · {complete} de {stay.people} completos
          </p>
        </div>
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </Button>
        </DialogPrimitive.Close>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
        <p className="flex items-start gap-2 rounded-md bg-info/10 px-3 py-2 text-xs text-info-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Los datos del documento y del domicilio se envían al Ministerio del Interior y no se
          vuelven a mostrar. Para corregirlos, vuelve a introducirlos.
        </p>

        {isLoading && <p className="text-muted-foreground">Cargando…</p>}
        {travellers?.map((t) =>
          editing !== "new" && editing?.id === t.id ? (
            <TravellerForm
              key={t.id}
              stay={stay}
              initial={t}
              saving={actions.save.isPending}
              onCancel={() => setEditing(null)}
              onSave={(data) =>
                actions.save.mutate(
                  { id: t.id, data },
                  {
                    onSuccess: () => {
                      toast.success("Viajero actualizado");
                      setEditing(null);
                    },
                    onError: (e) => toast.error(e.message),
                  },
                )
              }
            />
          ) : (
            <TravellerCard
              key={t.id}
              t={t}
              readOnly={readOnly}
              onEdit={() => setEditing(t)}
              onDelete={() =>
                actions.remove.mutate(t.id, { onError: (e) => toast.error(e.message) })
              }
            />
          ),
        )}

        {editing === "new" ? (
          <TravellerForm
            stay={stay}
            initial={null}
            firstOne={!travellers?.length}
            saving={actions.save.isPending}
            onCancel={() => setEditing(null)}
            onSave={(data) =>
              actions.save.mutate(
                { data },
                {
                  onSuccess: () => {
                    toast.success("Viajero registrado");
                    setEditing(null);
                  },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          />
        ) : (
          !readOnly && (
            <Button variant="outline" className="w-full" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> Añadir viajero
            </Button>
          )
        )}
      </div>
    </>
  );
}

function TravellerCard({
  t,
  readOnly,
  onEdit,
  onDelete,
}: {
  t: TravellerRow;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-muted-foreground">
          {t.is_minor ? <Baby className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {[t.first_name, t.last_name1, t.last_name2].filter(Boolean).join(" ")}
            {t.is_holder && (
              <Badge variant="secondary" className="ml-2 align-middle">
                Titular
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t.document_type
              ? `${DOCUMENT_TYPES[t.document_type as keyof typeof DOCUMENT_TYPES] ?? t.document_type} ${t.document_hint ?? ""}`
              : t.is_minor
                ? `Menor${t.kinship ? ` · ${KINSHIPS[t.kinship as keyof typeof KINSHIPS] ?? t.kinship}` : ""}`
                : "Sin documento"}
            {t.nationality ? ` · ${t.nationality}` : ""}
          </p>
          {t.missing.length > 0 ? (
            <p className="mt-1 text-xs text-gold-foreground">
              Falta: {t.missing.map((m) => FIELD_LABELS[m] ?? m).join(", ")}
            </p>
          ) : (
            <p className="mt-1 text-xs text-emerald-700">Completo</p>
          )}
        </div>
        {!readOnly && (
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon" aria-label="Editar" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
            {confirm ? (
              <Button variant="destructive" size="sm" onClick={onDelete}>
                Quitar
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Quitar"
                onClick={() => setConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type Form = Required<{ [K in keyof SesTraveller]: string }> & { is_holder: string };

function emptyForm(initial: TravellerRow | null, holder: boolean): Form {
  return {
    is_holder: initial ? String(initial.is_holder) : String(holder),
    first_name: initial?.first_name ?? "",
    last_name1: initial?.last_name1 ?? "",
    last_name2: initial?.last_name2 ?? "",
    document_type: initial?.document_type ?? (initial?.is_minor ? "" : "NIF"),
    document_number: "",
    document_support: "",
    birth_date: "",
    nationality: initial?.nationality ?? "ESP",
    sex: "",
    address: "",
    address_extra: "",
    municipality_code: "",
    municipality_name: "",
    postal_code: "",
    country: initial ? "" : "ESP",
    phone: "",
    phone2: "",
    email: "",
    kinship: initial?.kinship ?? "",
  };
}

export function TravellerForm({
  stay,
  initial,
  firstOne = false,
  saving,
  onSave,
  onCancel,
}: {
  stay: StayRef;
  initial: TravellerRow | null;
  firstOne?: boolean;
  saving: boolean;
  onSave: (data: SesTraveller) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<Form>(() => emptyForm(initial, firstOne));
  const set = (k: keyof Form) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  // A new guest sends every field; a correction only what was typed (the rest
  // is kept on the server, since it is never shown back).
  const data: SesTraveller = useMemo(
    () =>
      ({
        ...Object.fromEntries(
          Object.entries(f)
            .map(([k, v]) => [k, v.trim() || null] as const)
            .filter(([, v]) => !initial || v !== null),
        ),
        is_holder: f.is_holder === "true",
      }) as SesTraveller,
    [f, initial],
  );
  const minor = /^\d{4}-\d{2}-\d{2}$/.test(f.birth_date) && ageOn(f.birth_date, stay.checkIn) < 18;
  const all = travellerIssues(data, stay.checkIn);
  // On a correction, only what was typed can be judged here.
  const issues = initial ? all.filter((i) => f[i.field as keyof Form]?.trim()) : all;
  const [tried, setTried] = useState(false);
  const bad = (field: string) => tried && issues.some((i) => i.field === field);
  const field = (k: keyof Form, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`t-${k}`} className={bad(k) ? "text-destructive" : undefined}>
        {label}
      </Label>
      <Input
        id={`t-${k}`}
        value={f[k]}
        onChange={(e) => set(k)(e.target.value)}
        aria-invalid={bad(k) || undefined}
        {...props}
      />
    </div>
  );
  const select = (k: keyof Form, label: string, options: [string, string][], placeholder = "—") => (
    <div className="space-y-1">
      <Label className={bad(k) ? "text-destructive" : undefined}>{label}</Label>
      <Select value={f[k] || undefined} onValueChange={set(k)}>
        <SelectTrigger aria-invalid={bad(k) || undefined}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const countries = COUNTRIES.map((c) => [c.code, c.name] as [string, string]);

  return (
    <div className="space-y-4 rounded-md border border-info/40 bg-info/5 p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium">{initial ? "Corregir viajero" : "Nuevo viajero"}</p>
        <label className="flex items-center gap-2 text-xs">
          <Switch
            checked={f.is_holder === "true"}
            onCheckedChange={(v) => set("is_holder")(String(v))}
          />
          Titular de la reserva
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {field("first_name", "Nombre", { maxLength: 50, autoComplete: "off" })}
        {field("last_name1", "Primer apellido", { maxLength: 50, autoComplete: "off" })}
        {field("last_name2", "Segundo apellido", { maxLength: 50, autoComplete: "off" })}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {field("birth_date", "Fecha de nacimiento", { type: "date", max: stay.checkIn })}
        {select("sex", "Sexo", Object.entries(SEXES))}
        {select("nationality", "Nacionalidad", countries)}
      </div>
      {minor && select("kinship", "Parentesco con un adulto del grupo", Object.entries(KINSHIPS))}
      <div className="grid gap-3 sm:grid-cols-3">
        {select(
          "document_type",
          minor ? "Documento (opcional)" : "Documento",
          Object.entries(DOCUMENT_TYPES),
        )}
        {field("document_number", "Número", { maxLength: 15, autoComplete: "off" })}
        {(f.document_type === "NIF" || f.document_type === "NIE") &&
          field("document_support", "Nº de soporte", {
            maxLength: 9,
            autoComplete: "off",
            placeholder: "ABC123456",
          })}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {select("country", "País de residencia", countries)}
        {f.country === "ESP"
          ? field("municipality_code", "Municipio (código INE)", {
              inputMode: "numeric",
              maxLength: 5,
              placeholder: "46250",
            })
          : field("municipality_name", "Ciudad", { maxLength: 100 })}
        {field("postal_code", "Código postal", { maxLength: 20 })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("address", "Dirección", { maxLength: 100 })}
        {field("address_extra", "Piso, puerta… (opcional)", { maxLength: 100 })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("phone", "Teléfono", { type: "tel", maxLength: 20 })}
        {field("email", "Email", { type: "email", maxLength: 250 })}
      </div>

      {tried && issues.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-gold-foreground">
          {issues.map((i) => (
            <li key={i.field + i.message}>{i.message}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          disabled={saving || !f.first_name.trim()}
          onClick={() => {
            setTried(true);
            if (f.municipality_code && !/^\d{5}$/.test(f.municipality_code))
              return toast.error("El código de municipio del INE tiene 5 cifras");
            onSave(data);
          }}
        >
          {saving ? "Guardando…" : issues.length ? "Guardar incompleto" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
