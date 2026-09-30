import { createFileRoute, Link } from "@tanstack/react-router";
import { FiscalSettingsCard } from "@/components/settings/FiscalSettingsCard";
import { SettingsHeader, useSettingsHotel } from "@/components/settings/SettingsHotel";
import { AdminOnly } from "@/components/settings/AdminOnly";
import { useFiscalSettings, useInvoiceActions } from "@/lib/invoices";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/_app/settings/invoicing")({
  component: InvoicingSettingsPage,
});

function InvoicingSettingsPage() {
  const { hotels, hotel, setHotel } = useSettingsHotel();
  const { data: settings, isLoading } = useFiscalSettings(hotel);
  const actions = useInvoiceActions(hotel);
  return (
    <AdminOnly>
      <div className="space-y-6">
        <SettingsHeader
          title={t("Facturación VERI*FACTU")}
          description={
            <>
              {t(
                "Datos del emisor, entorno de la AEAT y certificado. Las facturas se consultan en",
              )}{" "}
              <Link to="/invoices" className="underline">
                {t("Facturas")}
              </Link>
              .
            </>
          }
          hotels={hotels}
          hotel={hotel}
          onHotel={setHotel}
        />
        {hotel && !isLoading && (
          <FiscalSettingsCard key={hotel} settings={settings ?? null} actions={actions} />
        )}
      </div>
    </AdminOnly>
  );
}
