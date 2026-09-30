import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { IdCard, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomerDrawer } from "@/components/CustomerDrawer";
import { useCustomerDirectory, type CustomerRow } from "@/lib/customers";
import { eur } from "@/lib/data";
import { useStaffHotels } from "@/lib/reports";
import { useRoles } from "@/lib/roles";
import { t, currentLocale } from "@/lib/i18n";

export const Route = createFileRoute("/_app/customers")({
  component: CustomersPage,
});

const STAY_FILTERS = {
  all: "Todos",
  in_house: "Alojados ahora",
  upcoming: "Con llegada próxima",
  guests: "Con estancias",
  never: "Sin estancias",
} as const;
type StayFilter = keyof typeof STAY_FILTERS;

const ID_FILTERS = {
  all: "Documento: todos",
  missing: "Documento pendiente",
  registered: "Documento registrado",
} as const;
type IdFilter = keyof typeof ID_FILTERS;

const SORTS = {
  recent: "Más recientes",
  name: "Nombre",
  stays: "Más estancias",
  spent: "Más gasto",
  next: "Próxima llegada",
} as const;
type Sort = keyof typeof SORTS;

const PAGE = 100;

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(currentLocale(), { day: "numeric", month: "short" }) : "—";

// Customer files: filterable directory; the sensitive traveller register lives
// in the side panel, visible only to admins after signing in again.
function CustomersPage() {
  const qc = useQueryClient();
  const { isAdmin } = useRoles();
  const { data: hotels } = useStaffHotels();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [hotel, setHotel] = useState("all");
  const [stay, setStay] = useState<StayFilter>("all");
  const [idf, setIdf] = useState<IdFilter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<CustomerRow | null>(null);

  // Search as you type, without a request per key.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  // New filters start from the first page.
  useEffect(() => setLimit(PAGE), [query, hotel, stay, idf, sort]);

  const { data, isFetching } = useCustomerDirectory({
    tenant: hotel === "all" ? null : hotel,
    search: query,
    stay,
    identity: idf,
    sort,
    limit,
  });
  const rows = data ?? [];
  const total = rows[0]?.total ?? 0;

  const del = useMutation({
    // Without bookings the customer is deleted; with bookings it is anonymised
    // (personal data removed, bookings kept) by delete_customer().
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc("delete_customer", { p_customer_id: id });
      if (error) throw new Error(error.message);
      return data as unknown as "deleted" | "anonymised";
    },
    onSuccess: (result) => {
      toast.success(
        result === "anonymised"
          ? "Datos personales eliminados; sus reservas se conservan sin ellos"
          : "Cliente eliminado",
      );
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(t(e.message)),
  });

  const hotelName = (id: string) => hotels?.find((h) => h.id === id)?.name ?? "";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("Clientes")}</h1>
        <p className="text-sm text-muted-foreground">
          {Number(total).toLocaleString(currentLocale())} {t("fichas")}
          {isFetching && t(" · actualizando…")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder={t("Buscar por nombre, teléfono o email")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-xs"
        />
        {hotels && hotels.length > 1 && (
          <Select value={hotel} onValueChange={setHotel}>
            <SelectTrigger className="min-w-0 flex-1 sm:w-48 sm:flex-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Todos los hoteles")}</SelectItem>
              {hotels.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(
          [
            [stay, setStay, STAY_FILTERS, "sm:w-48"],
            [idf, setIdf, ID_FILTERS, "sm:w-48"],
            [sort, setSort, SORTS, "sm:w-44"],
          ] as const
        ).map(([value, onChange, options, w], i) => (
          <Select key={i} value={value} onValueChange={(v) => (onChange as (x: string) => void)(v)}>
            <SelectTrigger className={`min-w-0 flex-1 sm:flex-none ${w}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(options).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {t(label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-2 text-left">{t("Nombre")}</th>
                  <th className="p-2 text-left">{t("Contacto")}</th>
                  <th className="p-2 text-right">{t("Estancias")}</th>
                  <th className="p-2 text-right">{t("Gastado")}</th>
                  <th className="p-2 text-left">{t("Última / próxima")}</th>
                  <th className="p-2 text-left">{t("Documento")}</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                    onClick={() => setOpen(c)}
                  >
                    <td className="p-2">
                      <div className="font-medium">{c.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{hotelName(c.tenant_id)}</div>
                    </td>
                    <td className="p-2">
                      <div className="font-mono text-xs">{c.phone ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{c.email ?? ""}</div>
                    </td>
                    <td className="p-2 text-right tabular-nums">{c.stays}</td>
                    <td className="p-2 text-right tabular-nums">{eur(Number(c.spent))}</td>
                    <td className="p-2 text-xs">
                      {c.in_house ? (
                        <span className="rounded bg-info/10 px-1.5 py-0.5 text-info">
                          {t("Alojado")}
                        </span>
                      ) : (
                        <>
                          {day(c.last_check_out)} / {day(c.next_check_in)}
                        </>
                      )}
                    </td>
                    <td className="p-2 text-xs">
                      {c.has_identity ? (
                        <span className="inline-flex items-center gap-1 text-info">
                          <IdCard className="h-3.5 w-3.5" /> {t("Registrado")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t("Pendiente")}</span>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title={t("Eliminar cliente")}
                          disabled={del.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            const label = c.name || c.email || "este cliente";
                            if (
                              window.confirm(
                                c.stays > 0
                                  ? `¿Eliminar los datos de «${label}»? Tiene reservas: se conservan, pero sin su nombre, contacto ni documento. No se puede deshacer.`
                                  : `¿Eliminar a «${label}»? No se puede deshacer.`,
                              )
                            ) {
                              del.mutate(c.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      {t("Sin clientes con estos filtros.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {rows.length < Number(total) && (
            <div className="border-t p-3 text-center">
              <Button
                variant="outline"
                size="sm"
                disabled={isFetching}
                onClick={() => setLimit((n) => n + PAGE)}
              >
                {t("Cargar más")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <CustomerDrawer
        customer={open}
        hotelName={open ? hotelName(open.tenant_id) : undefined}
        onOpenChange={(o) => !o && setOpen(null)}
      />
    </div>
  );
}
