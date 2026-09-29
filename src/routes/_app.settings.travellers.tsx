import { createFileRoute, Link } from "@tanstack/react-router";
import { SesSettingsCard } from "@/components/settings/SesSettingsCard";
import { SettingsHeader, useSettingsHotel } from "@/components/settings/SettingsHotel";
import { AdminOnly } from "@/components/settings/AdminOnly";
import { useSesActions, useSesSettings } from "@/lib/ses";

export const Route = createFileRoute("/_app/settings/travellers")({
  component: TravellersSettingsPage,
});

function TravellersSettingsPage() {
  const { hotels, hotel, setHotel } = useSettingsHotel();
  const { data: setup } = useSesSettings(hotel);
  const actions = useSesActions(hotel);
  return (
    <AdminOnly>
      <div className="space-y-6">
        <SettingsHeader
          title="SES.HOSPEDAJES"
          description={
            <>
              Credenciales de la Sede Electrónica, entorno y códigos de establecimiento. Las
              comunicaciones se siguen en{" "}
              <Link to="/travellers" className="underline">
                Registro de viajeros
              </Link>
              .
            </>
          }
          hotels={hotels}
          hotel={hotel}
          onHotel={setHotel}
        />
        {setup && (
          <SesSettingsCard
            key={hotel}
            settings={setup.settings ?? null}
            establishments={setup.establishments}
            properties={setup.properties}
            actions={actions}
          />
        )}
      </div>
    </AdminOnly>
  );
}
