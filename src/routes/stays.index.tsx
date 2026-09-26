import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Star, Plug, ArrowLeft, CalendarDays } from "lucide-react";
import { pms } from "@/integrations/pms";
import { useMember } from "@/lib/member-session";
import { useBrand } from "@/lib/brand";
import { accentGradient, dateOffset, ASSET_TYPE_LABELS } from "@/lib/stays";
import { NightlyPrice } from "@/components/NightlyPrice";
import { DateRangePicker } from "@/components/DateRangePicker";
import { HotelCoverArt } from "@/components/cover-art";
import type { AssetType } from "@/integrations/pms";
import { useBrandTenant, useFeatures } from "@/lib/features";

export const Route = createFileRoute("/stays/")({
  component: DiscoverScreen,
});

const ASSET_FILTERS: { label: string; value: AssetType | null }[] = [
  { label: "Todas", value: null },
  { label: "Habitaciones", value: "room" },
  { label: "Suites", value: "suite" },
  { label: "Familiares", value: "family" },
];

function DiscoverScreen() {
  const features = useFeatures();
  const { member } = useMember();
  const { brand, brandId } = useBrand();
  const { data: tenant } = useBrandTenant();
  const [province, setProvince] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState(dateOffset(7));
  const [checkOut, setCheckOut] = useState(dateOffset(10));
  const [assetType, setAssetType] = useState<AssetType | null>(null);

  // Switching brand changes which destinations exist; clear any selection that
  // no longer applies so the list doesn't come back empty.
  useEffect(() => {
    setProvince(null);
  }, [brandId]);

  const { data: provinces } = useQuery({
    queryKey: ["pms", "provinces", brandId],
    queryFn: () => pms.listProvinces({ brand: brandId }),
  });
  const { data: properties, isLoading } = useQuery({
    queryKey: ["pms", "properties", brandId, province],
    queryFn: () =>
      pms.listProperties({ brand: brandId, ...(province ? { provinceId: province } : {}) }),
  });

  return (
    <div>
      {/* Header */}
      <header className="px-5 pb-3 pt-6">
        <a
          href="/web"
          className="mb-3 inline-flex items-center gap-1 border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a la web
        </a>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--brand)]">
              {brand.name}
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-neutral-900">
              Hola{member ? `, ${member.name.split(" ")[0]}` : ""} 👋
            </h1>
            <p className="text-sm text-neutral-500">¿Cuándo nos visitas?</p>
          </div>
          <Link
            to={features.loyalty ? "/stays/loyalty" : "/stays/account"}
            className="flex h-11 w-11 items-center justify-center  bg-[var(--brand)] text-sm font-semibold text-white"
          >
            {member ? member.name.charAt(0) : "S"}
          </Link>
        </div>
        <div className="mt-3 inline-flex items-center gap-1.5  bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
          <Plug className="h-3 w-3" />
          Conectado a {pms.pmsName} vía API
        </div>
      </header>

      {/* Date range picker (single selector for check-in + check-out) */}
      <div className="mx-5 mb-2  bg-white p-3 shadow-sm ring-1 ring-neutral-100">
        <span className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
          <CalendarDays className="h-3 w-3" /> Fechas
        </span>
        <DateRangePicker
          checkIn={checkIn}
          checkOut={checkOut}
          pricing={tenant ? { tenantId: tenant.id } : undefined}
          onChange={({ checkIn: ci, checkOut: co }) => {
            setCheckIn(ci);
            setCheckOut(co);
          }}
        />
      </div>

      {/* Asset type filter */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-1 pt-2">
        {ASSET_FILTERS.map((f) => (
          <Chip
            key={f.label}
            active={assetType === f.value}
            onClick={() => setAssetType(f.value)}
            label={f.label}
          />
        ))}
      </div>

      {/* Destination chips (only when the brand has more than one) */}
      {(provinces?.length ?? 0) > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 py-2">
          <Chip active={province === null} onClick={() => setProvince(null)} label="Todas" />
          {(provinces ?? []).map((p) => (
            <Chip
              key={p.id}
              active={province === p.id}
              onClick={() => setProvince(p.id)}
              label={p.name}
              count={p.propertyCount}
            />
          ))}
        </div>
      )}

      {/* Property list */}
      <div className="space-y-4 px-5 pb-6 pt-1">
        {isLoading && (
          <p className="py-10 text-center text-sm text-neutral-400">Cargando hoteles…</p>
        )}
        {(properties ?? []).map((prop) => (
          <Link
            key={prop.id}
            to="/stays/property/$propertyId"
            params={{ propertyId: prop.id }}
            className="block overflow-hidden  bg-white shadow-sm ring-1 ring-neutral-100 transition active:scale-[0.99]"
          >
            <div
              className="relative h-36 overflow-hidden"
              style={{ background: accentGradient(prop.accent) }}
            >
              <HotelCoverArt />
              <div className="absolute inset-0 bg-black/10" />
              <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between text-white">
                <div>
                  <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider opacity-90">
                    <MapPin className="h-3 w-3" /> {prop.city} · {prop.provinceName}
                  </p>
                  <h3 className="text-lg font-semibold leading-tight drop-shadow-sm">
                    {prop.name}
                  </h3>
                </div>
                <span className="flex items-center gap-1  bg-white/90 px-2 py-0.5 text-xs font-semibold text-neutral-800">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />{" "}
                  {prop.rating.toFixed(1)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="line-clamp-1 pr-3 text-sm text-neutral-500">{prop.description}</p>
              {prop.fromPrice != null && (
                <div className="shrink-0">
                  <NightlyPrice night={prop.fromPrice} align="right" />
                </div>
              )}
            </div>
            {assetType && (
              <div className="border-t border-neutral-100 px-4 py-1.5">
                <span className="text-[11px] font-medium text-[var(--brand)]">
                  Filtrando: {ASSET_TYPE_LABELS[assetType]}
                </span>
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Chip({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0  px-4 py-2 text-sm font-medium transition ${
        active ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200"
      }`}
    >
      {label}
      {count != null && (
        <span className={`ml-1.5 text-xs ${active ? "opacity-70" : "text-neutral-400"}`}>
          {count}
        </span>
      )}
    </button>
  );
}
