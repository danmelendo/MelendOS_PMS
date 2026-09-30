import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { HotelWebData } from "@/lib/website";
import { t } from "@/lib/i18n";

/** The line a hotel pastes in its own website to add the booking widget. */
export function EmbedSnippet({ data }: { data: HotelWebData }) {
  const [search, setSearch] = useState(true);
  const [assistant, setAssistant] = useState(true);
  // From the hotel's booking domain when it has one; otherwise from this app.
  const origin = data.url ?? window.location.origin;
  const attrs = [
    `src="${origin}/embed.js"`,
    `data-hotel="${data.row.slug}"`,
    `data-color="${data.brand.accent}"`,
    !search && `data-search="false"`,
    !assistant && `data-assistant="false"`,
    "async",
  ].filter(Boolean);
  const code =
    (search ? `<div id="melendos-booking"></div>\n` : "") + `<script ${attrs.join(" ")}></script>`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{t("Añadir a tu web actual")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Si ya tienes web (WordPress, Wix…), pega este código donde quieras el buscador: tus huéspedes eligen fechas ahí y reservan en tu motor de reservas, sin comisiones.",
            )}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={`/ejemplo-web?hotel=${data.row.slug}`} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" /> {t("Ver ejemplo")}
          </a>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2">
            <Switch checked={search} onCheckedChange={setSearch} />

            {t("Buscador de fechas")}
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={assistant} onCheckedChange={setAssistant} />

            {t("Asistente de reservas (botón flotante)")}
          </label>
        </div>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
          {code}
        </pre>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() =>
              navigator.clipboard.writeText(code).then(() => toast.success(t("Código copiado")))
            }
          >
            <Copy className="h-4 w-4" /> {t("Copiar código")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t(
              "El `div` marca dónde sale el buscador; el asistente aparece abajo a la derecha. El pago y la reserva se hacen siempre en tu motor, con tu marca.",
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
