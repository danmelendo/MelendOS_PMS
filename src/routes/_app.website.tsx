import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { CheckCircle2, Copy, ExternalLink, Globe, Loader2, XCircle } from "lucide-react";
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
import { EmbedSnippet } from "@/components/EmbedSnippet";
import { WebTemplateEditor } from "@/components/WebTemplateEditor";
import { useStaffHotelModules } from "@/lib/features";
import { useRoles } from "@/lib/roles";
import { LEGAL_PAGES, type LegalPage } from "@/lib/legal-texts";
import {
  checkCname,
  PLATFORM_CNAME,
  useHotelWeb,
  useSaveHotelWeb,
  type DnsCheck,
} from "@/lib/website";
import { AdminOnly } from "@/components/settings/AdminOnly";
import { DnsTutorial } from "@/components/DnsTutorial";

export const Route = createFileRoute("/_app/website")({
  component: () => (
    <AdminOnly>
      <WebsitePage />
    </AdminOnly>
  ),
});

const copy = (text: string) =>
  navigator.clipboard.writeText(text).then(() => toast.success("Copiado"));

function WebsitePage() {
  const { isAdmin, loading } = useRoles();
  const { data: hotels } = useStaffHotelModules();
  const [hotel, setHotel] = useState<string | null>(null);
  useEffect(() => {
    if (!hotel && hotels?.length) setHotel(hotels[0].id);
  }, [hotel, hotels]);
  const { data } = useHotelWeb(hotel);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/today" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Globe className="h-5 w-5 text-info" /> Web y dominio
          </h1>
          <p className="text-sm text-muted-foreground">
            Dónde reservan tus huéspedes: tu motor de reservas en un subdominio propio, enlazado
            desde la web que ya tienes.
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
      {data && hotel && <DomainCard key={hotel} tenantId={hotel} data={data} />}
      {data && hotel && <WebTemplateEditor key={`tpl-${hotel}`} tenantId={hotel} data={data} />}
      {data && <EmbedSnippet key={`embed-${hotel}`} data={data} />}
      {data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Textos legales de tu web</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tu web muestra en el pie el aviso legal, la política de privacidad, la de cookies y
              las condiciones de reserva. Se rellenan solos con tus datos fiscales (Facturación →
              Datos fiscales) y tus políticas de pago y cancelación. Son una plantilla: revísalos
              con tu asesoría.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {(Object.keys(LEGAL_PAGES) as LegalPage[]).map((p) => (
              <a
                key={p}
                href={`${data.url ?? ""}/web/legal/${p}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
              >
                {LEGAL_PAGES[p]} <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DomainCard({
  tenantId,
  data,
}: {
  tenantId: string;
  data: NonNullable<ReturnType<typeof useHotelWeb>["data"]>;
}) {
  const save = useSaveHotelWeb(tenantId);
  const [domain, setDomain] = useState(data.row.domain ?? "");
  const [website, setWebsite] = useState(data.brand.websiteUrl ?? "");
  const [dns, setDns] = useState<DnsCheck | "checking" | null>(null);
  const label = domain.split(".")[0] || "reservas";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dirección de tu web de reservas</CardTitle>
        <p className="text-sm text-muted-foreground">
          Tu motor de reservas vive en un subdominio de tu web, por ejemplo{" "}
          <span className="font-mono">reservas.tuhotel.com</span>. Enlázalo desde el botón
          «Reservar» de tu web actual: no hace falta cambiarla.
        </p>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        {data.url ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2">
            <span className="text-muted-foreground">Ahora responde en</span>
            <a
              href={data.url}
              target="_blank"
              rel="noreferrer"
              className="font-mono font-medium underline-offset-4 hover:underline"
            >
              {data.url.replace(/^https:\/\//, "")}
            </a>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        ) : (
          <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground">
            La dirección se asigna al publicar el motor de reservas. En la demo se ve en «Web
            pública».
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="ws-domain">Tu subdominio (opcional)</Label>
          <Input
            id="ws-domain"
            placeholder="reservas.tuhotel.com"
            className="font-mono"
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value.trim().toLowerCase());
              setDns(null);
            }}
          />
          <div className="space-y-2 rounded-md border p-3">
            <p className="font-medium">Cómo conectarlo (una vez)</p>
            <p className="text-muted-foreground">
              En el panel de tu dominio (donde lo compraste o tu informático), crea este registro
              DNS:
            </p>
            <table className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Tipo</th>
                  <th className="py-1 font-medium">Nombre</th>
                  <th className="py-1 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr>
                  <td className="py-1">CNAME</td>
                  <td className="py-1">{label}</td>
                  <td className="py-1">
                    {PLATFORM_CNAME ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                        onClick={() => copy(PLATFORM_CNAME)}
                      >
                        {PLATFORM_CNAME} <Copy className="h-3 w-3" />
                      </button>
                    ) : (
                      <span className="font-sans text-muted-foreground">
                        te lo damos al activar tu cuenta
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground">
              El cambio tarda de unos minutos a unas horas. El certificado HTTPS se crea solo.
            </p>
            <DnsTutorial
              subdomain={domain || "reservas.tuhotel.com"}
              label={label}
              target={PLATFORM_CNAME}
            />
            {domain && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={dns === "checking"}
                  onClick={() => {
                    setDns("checking");
                    checkCname(domain, PLATFORM_CNAME)
                      .then(setDns)
                      .catch(() => setDns({ ok: false, reason: "No se pudo consultar el DNS" }));
                  }}
                >
                  {dns === "checking" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Comprobar DNS"
                  )}
                </Button>
                {dns && dns !== "checking" && (
                  <span
                    className={`flex items-center gap-1 text-xs ${dns.ok ? "text-emerald-700" : "text-destructive"}`}
                  >
                    {dns.ok ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" /> Conectado a {dns.target}
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4" /> {dns.reason}
                      </>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ws-site">Tu web principal (opcional)</Label>
          <Input
            id="ws-site"
            placeholder="https://www.tuhotel.com"
            value={website}
            onChange={(e) => setWebsite(e.target.value.trim())}
          />
          <p className="text-xs text-muted-foreground">
            A donde vuelven los huéspedes desde la app y la web de reservas («Volver a la web»).
          </p>
        </div>

        <Button
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              { domain, website_url: website },
              {
                onSuccess: () => toast.success("Guardado"),
                onError: (e) => toast.error(e.message),
              },
            )
          }
        >
          Guardar
        </Button>
      </CardContent>
    </Card>
  );
}
