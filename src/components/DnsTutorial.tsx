import { useState } from "react";
import { CheckCircle2, ChevronDown, Globe, MousePointerClick, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/**
 * Step-by-step guide to point the hotel's booking subdomain at Melend/OS, with
 * pictures of what each screen looks like. Every provider draws its DNS panel
 * its own way, so the pictures are generic mock-ups filled with this hotel's
 * real values (name and target), not screenshots of one provider.
 */
export function DnsTutorial({
  subdomain,
  label,
  target,
}: {
  /** reservas.tuhotel.com (or an example). */
  subdomain: string;
  /** The part before the hotel's domain: "reservas". */
  label: string;
  /** Where the CNAME points (VITE_PLATFORM_CNAME), or empty until assigned. */
  target: string;
}) {
  const [open, setOpen] = useState(false);
  const value = target || `(${t("te lo damos al activar tu cuenta")})`;
  const root = subdomain.split(".").slice(1).join(".") || "tuhotel.com";

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-medium"
        aria-expanded={open}
      >
        {t("Guía paso a paso, con imágenes")}
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ol className="space-y-6 border-t px-3 py-4">
          <Step n={1} title={t("Entra en el panel de tu dominio")}>
            <p>
              {t("Es la web donde compraste")} <span className="font-mono">{root}</span>{" "}
              {t("(o la de quien te lleva la web). Busca la sección")} <b>{t("DNS")}</b>,{" "}
              <b>{t("Zona DNS")}</b> {t("o")} <b>{t("Gestionar DNS")}</b>.
            </p>
            <Providers />
          </Step>

          <Step n={2} title={t("Añade un registro nuevo de tipo CNAME")}>
            <p>
              {t("Pulsa")} <b>{t("Añadir registro")}</b>{" "}
              {t("y rellénalo así. Si el proveedor pide TTL, deja el que venga por defecto.")}
            </p>
            <DnsFormPicture label={label} root={root} value={value} />
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>
                {t("En")} <b>{t("Nombre")}</b> {t("escribe solo")}{" "}
                <span className="font-mono">{label}</span>
                {t(": el proveedor añade")} <span className="font-mono">.{root}</span>{" "}
                {t("por su cuenta. Si escribes el nombre completo, acabará como")}{" "}
                <span className="font-mono">
                  {label}.{root}.{root}
                </span>
                .
              </li>
              <li>
                {t("Si ya existe un registro")} <span className="font-mono">{label}</span>{" "}
                {t("(de tipo A, AAAA o CNAME), bórralo antes: no pueden convivir.")}
              </li>
              <li>
                {t("En Cloudflare, deja la nube en gris (")}
                <b>{t("Solo DNS")}</b>
                {t("), no en naranja.")}
              </li>
              <li>
                {t("No sirve para el dominio sin nada delante (")}
                <span className="font-mono">{root}</span>
                {t("): usa siempre un subdominio como")} <span className="font-mono">{label}</span>.
              </li>
            </ul>
          </Step>

          <Step n={3} title={t("Guarda y comprueba aquí")}>
            <p>
              {t("Guarda el registro en tu proveedor. Vuelve a esta página, escribe")}{" "}
              <span className="font-mono">{subdomain}</span> {t("arriba y pulsa")}{" "}
              <b>{t("Comprobar DNS")}</b>
              {t(". Suele tardar unos minutos; a veces, unas horas.")}
            </p>
            <CheckPicture subdomain={subdomain} value={target || "Melend/OS"} />
          </Step>

          <Step n={4} title={t("Enlaza tu web a las reservas")}>
            <p>
              {t("En tu web actual, haz que el botón")} <b>{t("Reservar")}</b> {t("lleve a")}{" "}
              <span className="font-mono">https://{subdomain}</span>
              {t(
                ". O pega el buscador de fechas con el código de «Añadir a tu web actual», más abajo. El certificado HTTPS se crea solo.",
              )}
            </p>
            <BookButtonPicture subdomain={subdomain} />
          </Step>
        </ol>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

// Where the DNS section usually is. Menu names change over time: the guide
// says so instead of promising exact paths.
const PROVIDERS: [string, string][] = [
  ["IONOS / 1&1", "Dominios y SSL → tu dominio → DNS"],
  ["GoDaddy", "Mis productos → tu dominio → DNS"],
  ["DonDominio", "Dominios → tu dominio → Zona DNS"],
  ["Arsys / Piensa Solutions", "Dominios → tu dominio → DNS"],
  ["Hostinger", "Dominios → tu dominio → Registros DNS"],
  ["Cloudflare", "tu dominio → DNS → Registros"],
];

function Providers() {
  return (
    <div className="overflow-hidden rounded-md border text-xs">
      <table className="w-full text-left">
        <tbody>
          {PROVIDERS.map(([name, path]) => (
            <tr key={name} className="border-b last:border-0">
              <td className="whitespace-nowrap px-2 py-1.5 font-medium">{name}</td>
              <td className="px-2 py-1.5 text-muted-foreground">{t(path)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t bg-muted/40 px-2 py-1.5 text-muted-foreground">
        {t(
          "Los nombres de los menús cambian con el tiempo. Si no lo encuentras, busca «DNS» en la ayuda de tu proveedor o pásale esta guía a quien te lleva la web.",
        )}
      </p>
    </div>
  );
}

/** Browser-window frame for the pictures. */
function Picture({
  url,
  caption,
  children,
}: {
  url: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="space-y-1">
      <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
        <div className="flex items-center gap-1.5 border-b bg-muted/60 px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-red-400/70" />
          <span className="h-2 w-2 rounded-full bg-amber-400/70" />
          <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
          <span className="ml-2 truncate rounded bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {url}
          </span>
        </div>
        <div className="p-3">{children}</div>
      </div>
      <figcaption className="text-[11px] text-muted-foreground">{t(caption)}</figcaption>
    </figure>
  );
}

function Field({
  label,
  value,
  mono = true,
  highlight = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "truncate rounded border bg-background px-2 py-1 text-xs",
          mono && "font-mono",
          highlight && "border-info ring-2 ring-info/30",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function DnsFormPicture({ label, root, value }: { label: string; root: string; value: string }) {
  return (
    <Picture
      url={`panel-de-tu-proveedor.com/dominios/${root}/dns`}
      caption="Ilustración: así es el formulario en casi todos los proveedores (cambian los colores y el orden)."
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold">
            {t("Registros DNS de")} {root}
          </p>
          <span className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground">
            <Plus className="h-3 w-3" /> {t("Añadir registro")}
          </span>
        </div>
        <div className="grid grid-cols-[5rem_1fr] gap-2 rounded-md border border-dashed border-info/60 bg-info/5 p-2 sm:grid-cols-[5rem_8rem_1fr_4rem]">
          <Field label={t("Tipo")} value="CNAME" highlight />
          <Field label={t("Nombre")} value={label} highlight />
          <div className="col-span-2 sm:col-span-1">
            <Field label={t("Valor / Destino")} value={value} highlight />
          </div>
          <div className="hidden sm:block">
            <Field label="TTL" value="Auto" mono={false} />
          </div>
        </div>
        <div className="flex justify-end">
          <span className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-[10px] font-medium text-white">
            {t("Guardar")} <MousePointerClick className="h-3 w-3" />
          </span>
        </div>
      </div>
    </Picture>
  );
}

function CheckPicture({ subdomain, value }: { subdomain: string; value: string }) {
  return (
    <Picture
      url="panel de Melend/OS → Configuración → Web y dominio"
      caption="Cuando el DNS está bien, aparece «Conectado» en verde."
    >
      <div className="space-y-2">
        <Field label={t("Tu subdominio")} value={subdomain} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border px-2 py-1 text-[10px] font-medium">
            {t("Comprobar DNS")}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t("Conectado a")} {value}
          </span>
        </div>
      </div>
    </Picture>
  );
}

function BookButtonPicture({ subdomain }: { subdomain: string }) {
  const root = subdomain.split(".").slice(1).join(".") || "tuhotel.com";
  return (
    <Picture url={`www.${root}`} caption="Tu web no cambia: solo el destino del botón «Reservar».">
      <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold">
          <Globe className="h-3.5 w-3.5" /> {t("Tu hotel")}
        </span>
        <span className="hidden gap-3 text-[10px] text-muted-foreground sm:flex">
          <span>{t("Habitaciones")}</span>
          <span>{t("Galería")}</span>
          <span>{t("Contacto")}</span>
        </span>
        <span className="rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground ring-2 ring-info/40">
          {t("Reservar")}
        </span>
      </div>
      <p className="mt-2 text-center font-mono text-[10px] text-muted-foreground">
        {t("→ https://")}
        {subdomain}
      </p>
    </Picture>
  );
}
