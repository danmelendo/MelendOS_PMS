import { useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRoles } from "@/lib/roles";
import { usePromoCodes, formatDiscount, type DiscountType, type PromoCode } from "@/lib/promos";
import { toast } from "sonner";
import { Archive, Trash2, Ticket } from "lucide-react";
import { t, currentLocale } from "@/lib/i18n";

export const Route = createFileRoute("/_app/promos")({
  component: PromosPage,
});

interface NewCode {
  code: string;
  discount_type: DiscountType;
  discount_value: string;
  valid_from: string; // yyyy-mm-dd
  valid_until: string; // yyyy-mm-dd ("" = no expiry)
  single_use: boolean;
  /** Shown on the booking web under "Habitaciones en oferta". */
  published: boolean;
  headline: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function PromosPage() {
  const { isAdmin, loading: rolesLoading } = useRoles();
  const { data: codes } = usePromoCodes();
  const qc = useQueryClient();

  const [form, setForm] = useState<NewCode>({
    code: "",
    discount_type: "percent",
    discount_value: "",
    valid_from: todayISO(),
    valid_until: "",
    single_use: false,
    published: false,
    headline: "",
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["promo_codes"] });

  const create = useMutation({
    mutationFn: async (n: NewCode) => {
      const code = n.code.trim().toUpperCase();
      if (!code) throw new Error("Indica el nombre del código");
      if (!/^[A-Z0-9_-]+$/.test(code))
        throw new Error("Usa solo letras, números, guion o guion bajo");
      const value = Number(n.discount_value);
      if (!value || value <= 0) throw new Error("El valor del descuento debe ser mayor que 0");
      if (n.discount_type === "percent" && value > 100)
        throw new Error("El porcentaje no puede superar 100");
      if (n.valid_until && n.valid_until < n.valid_from)
        throw new Error("La fecha de fin es anterior a la de inicio");

      const { error } = await supabase.from("promo_codes").insert({
        code,
        discount_type: n.discount_type,
        discount_value: value,
        valid_from: new Date(`${n.valid_from}T00:00:00`).toISOString(),
        // include the whole end day (until 23:59:59 local)
        valid_until: n.valid_until ? new Date(`${n.valid_until}T23:59:59`).toISOString() : null,
        single_use: n.single_use,
        published: n.published,
        headline: n.headline.trim() || null,
      });
      if (error) {
        if (error.code === "23505") throw new Error("Ya existe un código activo con ese nombre");
        throw error;
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("Código creado"));
      setForm((f) => ({ ...f, code: "", discount_value: "", headline: "" }));
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo crear el código"),
  });

  const patch = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PromoCode> }) => {
      const { error } = await supabase.from("promo_codes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("Guardado"));
    },
    onError: (e: Error) => toast.error(e.message || "Error al guardar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("promo_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success(t("Código eliminado"));
    },
    onError: (e: Error) => toast.error(e.message || "Error al eliminar"),
  });

  if (rolesLoading) return null;
  if (!isAdmin) return <Navigate to="/today" />;

  const active = codes?.filter((c) => !c.archived) ?? [];
  const archived = codes?.filter((c) => c.archived) ?? [];

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(currentLocale(), {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "—";

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Ticket className="h-6 w-6" /> {t("Códigos promocionales")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("Descuentos sobre el precio de la habitación. Los extras nunca se descuentan.")}
        </p>
      </div>

      {/* ── Create ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Nuevo código")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(form);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="code">{t("Nombre del código")}</Label>
              <Input
                id="code"
                placeholder="VERANO15"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="uppercase tracking-wide"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("Tipo de descuento")}</Label>
              <Select
                value={form.discount_type}
                onValueChange={(v) => setForm((f) => ({ ...f, discount_type: v as DiscountType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">{t("Porcentaje (%)")}</SelectItem>
                  <SelectItem value="fixed">{t("Importe fijo (€)")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="value">
                {form.discount_type === "percent" ? t("Porcentaje") : t("Importe (€)")}
              </Label>
              <Input
                id="value"
                type="number"
                min="0"
                step={form.discount_type === "percent" ? "1" : "0.5"}
                placeholder={form.discount_type === "percent" ? "15" : "10"}
                value={form.discount_value}
                onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="from">{t("Válido desde")}</Label>
              <Input
                id="from"
                type="date"
                value={form.valid_from}
                onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="until">
                {t("Válido hasta")} <span className="text-muted-foreground">{t("(opcional)")}</span>
              </Label>
              <Input
                id="until"
                type="date"
                value={form.valid_until}
                onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))}
              />
            </div>

            <div className="flex items-end gap-3">
              <div className="flex items-center gap-2 h-10">
                <Switch
                  id="single"
                  checked={form.single_use}
                  onCheckedChange={(single_use) => setForm((f) => ({ ...f, single_use }))}
                />
                <Label htmlFor="single" className="cursor-pointer">
                  {t("Un solo uso")}
                </Label>
              </div>
            </div>

            <div className="flex items-end gap-3">
              <div className="flex items-center gap-2 h-10">
                <Switch
                  id="published"
                  checked={form.published}
                  onCheckedChange={(published) => setForm((f) => ({ ...f, published }))}
                />
                <Label htmlFor="published" className="cursor-pointer">
                  {t("Publicar en la web")}
                </Label>
              </div>
            </div>

            {form.published && (
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="headline">
                  {t("Titular en la web")}{" "}
                  <span className="text-muted-foreground">{t("(opcional)")}</span>
                </Label>
                <Input
                  id="headline"
                  maxLength={120}
                  placeholder={t("Escapada de otoño")}
                  value={form.headline}
                  onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
                />
              </div>
            )}

            <p className="text-xs text-muted-foreground lg:col-span-3">
              {t(
                "Los códigos publicados aparecen en «Habitaciones en oferta» de tu web de reservas. Los demás solo funcionan si das el código al cliente. Las rebajas por fechas se crean en Tarifas con una regla de fecha en negativo.",
              )}
            </p>

            <div className="lg:col-span-3">
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? t("Creando…") : t("Crear código")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Active codes ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Códigos activos")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {active.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{t("No hay códigos activos.")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-muted/30 border-y">
                  <tr>
                    <th className="p-2 text-left">{t("Código")}</th>
                    <th className="p-2 text-right">{t("Descuento")}</th>
                    <th className="p-2 text-center">{t("Vigencia")}</th>
                    <th className="p-2 text-center">{t("Uso")}</th>
                    <th className="p-2 text-center">{t("Activo")}</th>
                    <th className="p-2 text-center">{t("En la web")}</th>
                    <th className="p-2 text-right">{t("Acciones")}</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="p-2">
                        <span className="font-mono font-medium tracking-wide">{c.code}</span>
                        {c.published && (
                          <button
                            type="button"
                            className="block text-left text-xs text-muted-foreground underline-offset-4 hover:underline"
                            title={t("Cambiar el titular que se ve en la web")}
                            onClick={() => {
                              const headline = prompt("Titular en la web", c.headline ?? "");
                              if (headline !== null)
                                patch.mutate({
                                  id: c.id,
                                  patch: { headline: headline.trim().slice(0, 120) || null },
                                });
                            }}
                          >
                            {c.headline || t("Añadir titular")}
                          </button>
                        )}
                      </td>
                      <td className="p-2 text-right tabular-nums">{formatDiscount(c)}</td>
                      <td className="p-2 text-center text-xs text-muted-foreground">
                        {fmtDate(c.valid_from)} →{" "}
                        {c.valid_until ? fmtDate(c.valid_until) : t("sin caducidad")}
                      </td>
                      <td className="p-2 text-center">
                        {c.single_use ? (
                          <Badge variant="outline">
                            {t("1 uso (")}
                            {c.times_used}/1)
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {c.times_used}
                            {c.max_uses ? `/${c.max_uses}` : ""} usos
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <Switch
                          checked={c.active}
                          onCheckedChange={(active) =>
                            patch.mutate({ id: c.id, patch: { active } })
                          }
                        />
                      </td>
                      <td className="p-2 text-center">
                        <Switch
                          checked={c.published}
                          aria-label={t("Publicar en la web")}
                          onCheckedChange={(published) =>
                            patch.mutate({ id: c.id, patch: { published } })
                          }
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title={t("Archivar")}
                            onClick={() =>
                              patch.mutate({ id: c.id, patch: { archived: true, active: false } })
                            }
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title={t("Eliminar")}
                            onClick={() => {
                              if (confirm(`¿Eliminar el código ${c.code}?`)) remove.mutate(c.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Archived codes ── */}
      {archived.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">{t("Archivados")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="bg-muted/30 border-y">
                  <tr>
                    <th className="p-2 text-left">{t("Código")}</th>
                    <th className="p-2 text-right">{t("Descuento")}</th>
                    <th className="p-2 text-center">{t("Vigencia")}</th>
                    <th className="p-2 text-center">{t("Usos")}</th>
                    <th className="p-2 text-right">{t("Acciones")}</th>
                  </tr>
                </thead>
                <tbody>
                  {archived.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 text-muted-foreground">
                      <td className="p-2 font-mono tracking-wide line-through">{c.code}</td>
                      <td className="p-2 text-right tabular-nums">{formatDiscount(c)}</td>
                      <td className="p-2 text-center text-xs">
                        {fmtDate(c.valid_from)} →{" "}
                        {c.valid_until ? fmtDate(c.valid_until) : t("sin caducidad")}
                      </td>
                      <td className="p-2 text-center">{c.times_used}</td>
                      <td className="p-2">
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            title={t("Eliminar")}
                            onClick={() => {
                              if (confirm(`¿Eliminar definitivamente ${c.code}?`))
                                remove.mutate(c.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
