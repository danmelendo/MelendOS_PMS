import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadHotelImage, useSaveHotelWeb, type HotelWebData } from "@/lib/website";

const MAX_GALLERY = 24;

/** The template web of a hotel: texts, colour, contact and photos. */
export function WebTemplateEditor({ tenantId, data }: { tenantId: string; data: HotelWebData }) {
  const save = useSaveHotelWeb(tenantId);
  const b = data.brand;
  const [f, setF] = useState({
    short: b.short === b.name ? "" : b.short,
    accent: b.accent,
    eyebrow: b.eyebrow === b.name ? "" : b.eyebrow,
    heroTitle: b.heroTitle === b.name ? "" : b.heroTitle,
    heroSubtitle: b.heroSubtitle,
    tagline: b.tagline,
    about: b.about,
    phone: b.phone,
    email: b.email,
    address: b.address,
    instagram: b.instagram,
    facebook: b.facebook,
    logo_url: b.logoUrl ?? "",
    hero_image_url: b.heroImageUrl ?? "",
  });
  const [gallery, setGallery] = useState<string[]>(b.gallery);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const text = (k: keyof typeof f, label: string, max: number, placeholder = "") => (
    <div className="space-y-1">
      <Label htmlFor={`tw-${k}`}>{label}</Label>
      <Input
        id={`tw-${k}`}
        maxLength={max}
        placeholder={placeholder}
        value={f[k]}
        onChange={(e) => set(k)(e.target.value)}
      />
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Tu web</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            La web de plantilla incluida en tu plan: portada, fotos, textos y contacto. Las
            habitaciones, precios y disponibilidad salen solos del PMS.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={data.url ?? "/web"} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" /> Ver web
          </a>
        </Button>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <section className="grid gap-4 sm:grid-cols-2">
          <ImageField
            label="Logo"
            hint="PNG con fondo transparente; se ve en la cabecera."
            value={f.logo_url}
            tenantId={tenantId}
            kind="logo"
            onChange={set("logo_url")}
          />
          <ImageField
            label="Foto de portada"
            hint="Horizontal, al menos 1600 px de ancho."
            value={f.hero_image_url}
            tenantId={tenantId}
            kind="cover"
            onChange={set("hero_image_url")}
          />
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {text("heroTitle", "Título de la portada", 120, data.brand.name)}
          {text("eyebrow", "Antetítulo", 80, `${data.brand.name} · Hotel boutique`)}
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="tw-heroSubtitle">Subtítulo de la portada</Label>
            <textarea
              id="tw-heroSubtitle"
              maxLength={400}
              className="min-h-16 w-full rounded-md border bg-background px-3 py-2"
              value={f.heroSubtitle}
              onChange={(e) => set("heroSubtitle")(e.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="tw-about">Sobre nosotros</Label>
            <textarea
              id="tw-about"
              maxLength={2000}
              className="min-h-28 w-full rounded-md border bg-background px-3 py-2"
              placeholder="Quiénes sois, qué tiene de especial el hotel, el barrio…"
              value={f.about}
              onChange={(e) => set("about")(e.target.value)}
            />
          </div>
          {text("short", "Nombre corto", 40, data.brand.name)}
          <div className="space-y-1">
            <Label htmlFor="tw-accent">Color de la marca</Label>
            <div className="flex items-center gap-2">
              <input
                id="tw-accent"
                type="color"
                value={f.accent}
                onChange={(e) => set("accent")(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <Input
                className="font-mono"
                maxLength={7}
                value={f.accent}
                onChange={(e) => set("accent")(e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {text("phone", "Teléfono", 40, "+34 960 000 000")}
          {text("email", "Email de contacto", 120, "hola@tuhotel.com")}
          <div className="sm:col-span-2">
            {text("address", "Dirección", 200, "Calle…, 46001 Valencia")}
          </div>
          {text("instagram", "Instagram (URL)", 200, "https://instagram.com/tuhotel")}
          {text("facebook", "Facebook (URL)", 200, "https://facebook.com/tuhotel")}
        </section>

        <GalleryField tenantId={tenantId} value={gallery} onChange={setGallery} />

        <Button
          disabled={save.isPending}
          onClick={() =>
            save.mutate(
              { brand: { ...f, gallery } },
              {
                onSuccess: () => toast.success("Web guardada"),
                onError: (e) => toast.error(e.message),
              },
            )
          }
        >
          {save.isPending ? "Guardando…" : "Guardar la web"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ImageField({
  label,
  hint,
  value,
  tenantId,
  kind,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  tenantId: string;
  kind: string;
  onChange: (url: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-contain" />
          ) : (
            <ImagePlus className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="space-y-1">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : value ? "Cambiar" : "Subir"}
            </Button>
            {value && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange("")}
                aria-label={`Quitar ${label}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            onChange(await uploadHotelImage(tenantId, kind, file));
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function GalleryField({
  tenantId,
  value,
  onChange,
}: {
  tenantId: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const move = (i: number, d: number) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <Label>Galería de fotos</Label>
          <p className="text-xs text-muted-foreground">
            Hasta {MAX_GALLERY}. La primera sale más grande.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || value.length >= MAX_GALLERY}
          onClick={() => input.current?.click()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          Añadir fotos
        </Button>
      </div>
      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {value.map((src, i) => (
            <div key={src} className="group relative overflow-hidden rounded border bg-muted">
              <img src={src} alt="" className="aspect-[4/3] w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 p-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="p-1 text-white disabled:opacity-30"
                  aria-label="Mover antes"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((x) => x !== src))}
                  className="p-1 text-white"
                  aria-label="Quitar foto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={i === value.length - 1}
                  onClick={() => move(i, 1)}
                  className="p-1 text-white disabled:opacity-30"
                  aria-label="Mover después"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])].slice(0, MAX_GALLERY - value.length);
          e.target.value = "";
          if (!files.length) return;
          setBusy(true);
          try {
            const urls: string[] = [];
            for (const file of files) urls.push(await uploadHotelImage(tenantId, "gallery", file));
            onChange([...value, ...urls]);
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </section>
  );
}
