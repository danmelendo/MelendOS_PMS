import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Percent, Tag } from "lucide-react";
import { useState } from "react";
import { addDays } from "@domain/dates.ts";
import { pms } from "@/integrations/pms";
import { eur0 } from "@/lib/stays";
import { useHotelOffers, type HotelSale, type PublishedPromo } from "@/lib/offers";

// "Habitaciones en oferta" on the hotel page: the rooms that are cheaper on
// the nights of a sale, and the promo codes the hotel publishes. Prices come
// from the booking engine, so what is shown here is what the guest pays.

const shortDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

/** A short stay inside the sale (two nights, or fewer if the sale is shorter). */
function saleStay(s: HotelSale): { checkIn: string; checkOut: string } {
  const lastOut = addDays(s.to, 1);
  const out = addDays(s.from, 2);
  return { checkIn: s.from, checkOut: out < lastOut ? out : lastOut };
}

export function HotelOffers({
  tenantId,
  propertyId,
  guests,
  onPickDates,
  onPickPromo,
  activePromo,
}: {
  tenantId: string | null | undefined;
  propertyId: string;
  guests: number;
  onPickDates: (checkIn: string, checkOut: string) => void;
  onPickPromo: (code: string | undefined) => void;
  activePromo: string | undefined;
}) {
  const { data, isLoading } = useHotelOffers(tenantId);
  const sales = data?.sales.slice(0, 3) ?? [];
  const promos = data?.promos.slice(0, 4) ?? [];

  return (
    <div>
      <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
        <Tag className="h-5 w-5 text-[var(--brand)]" /> Habitaciones en oferta
      </h2>
      <p className="text-sm text-neutral-500">Rebajas por fechas y códigos del hotel.</p>
      <div className="mt-5 space-y-3">
        {sales.map((s) => (
          <SaleCard
            key={`${s.name}-${s.from}`}
            sale={s}
            propertyId={propertyId}
            guests={guests}
            promo={activePromo}
            onPickDates={onPickDates}
          />
        ))}
        {promos.map((p) => (
          <PromoCard
            key={p.code}
            promo={p}
            active={activePromo === p.code}
            onToggle={() => onPickPromo(activePromo === p.code ? undefined : p.code)}
          />
        ))}
        {!isLoading && sales.length === 0 && promos.length === 0 && (
          <p className="bg-white p-4 text-sm text-neutral-500 ring-1 ring-neutral-100">
            Ahora no hay ofertas. En el calendario de fechas verás el precio de cada noche.
          </p>
        )}
      </div>
    </div>
  );
}

function SaleCard({
  sale,
  propertyId,
  guests,
  promo,
  onPickDates,
}: {
  sale: HotelSale;
  propertyId: string;
  guests: number;
  promo: string | undefined;
  onPickDates: (checkIn: string, checkOut: string) => void;
}) {
  const stay = saleStay(sale);
  const { data: rooms } = useQuery({
    queryKey: ["pms", "availability", propertyId, stay.checkIn, stay.checkOut, guests],
    queryFn: () => pms.searchAvailability({ propertyId, ...stay, guests }),
  });
  const cheapest = (rooms ?? [])
    .filter((o) => o.available)
    .sort((a, b) => a.pricePerNight - b.pricePerNight)
    .slice(0, 3);

  return (
    <div className="bg-white p-4 shadow-sm ring-1 ring-neutral-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold leading-tight">{sale.name}</h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            Noches del {shortDate(sale.from)} al {shortDate(sale.to)}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-0.5 bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
          −{sale.discount_pct} <Percent className="h-3 w-3" />
        </span>
      </div>
      {cheapest.length > 0 && (
        <ul className="mt-3 divide-y divide-neutral-100 text-sm">
          {cheapest.map((o) => (
            <li key={o.room.id}>
              <Link
                to="/web/room/$roomId"
                params={{ roomId: o.room.id }}
                search={{ hotelId: propertyId, ...stay, ...(promo ? { promo } : {}) }}
                className="flex items-center justify-between py-2 hover:text-[var(--brand)]"
              >
                <span>Habitación {o.room.name}</span>
                <span className="font-semibold">
                  {eur0(o.pricePerNight)}
                  <span className="text-xs font-normal text-neutral-400">/noche</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rooms && cheapest.length === 0 && (
        <p className="mt-3 text-xs text-neutral-400">Completo en esas fechas.</p>
      )}
      <button
        type="button"
        onClick={() => onPickDates(stay.checkIn, stay.checkOut)}
        className="mt-2 text-sm font-medium text-[var(--brand)] underline-offset-4 hover:underline"
      >
        Ver todas las habitaciones en esas fechas
      </button>
    </div>
  );
}

function PromoCard({
  promo,
  active,
  onToggle,
}: {
  promo: PublishedPromo;
  active: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const amount =
    promo.discount_type === "percent"
      ? `−${promo.discount_value.toLocaleString("es-ES")} %`
      : `−${eur0(promo.discount_value)}`;
  return (
    <div className="bg-white p-4 shadow-sm ring-1 ring-neutral-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold leading-tight">
            {promo.headline || "Descuento en tu habitación"}
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            En todas las habitaciones
            {promo.valid_until
              ? ` · reservando hasta el ${new Date(promo.valid_until).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`
              : ""}
          </p>
        </div>
        <span className="shrink-0 bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
          {amount}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          title="Copiar el código"
          onClick={() => {
            void navigator.clipboard?.writeText(promo.code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="flex items-center gap-1.5 border border-dashed border-neutral-300 px-2.5 py-1 font-mono text-sm font-semibold"
        >
          {promo.code}
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-neutral-400" />
          )}
        </button>
        <button
          type="button"
          onClick={onToggle}
          className={`px-3 py-1 text-xs font-semibold transition ${
            active
              ? "bg-[var(--brand)] text-white"
              : "bg-[var(--brand-soft)] text-[var(--brand)] hover:opacity-80"
          }`}
        >
          {active ? "Código aplicado" : "Usar este código"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-neutral-400">
        Se descuenta de la habitación al confirmar la reserva; los extras no llevan descuento.
      </p>
    </div>
  );
}
