import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Star } from "lucide-react";
import { pms } from "@/integrations/pms";
import { useBrand } from "@/lib/brand";
import { accentGradient, eur0, priceBand } from "@/lib/stays";
import { HotelCoverArt } from "@/components/cover-art";

export const Route = createFileRoute("/web/hotels")({
  component: WebHotels,
});

// Hotels of the active brand (a tenant may run one hotel or a small chain).
function WebHotels() {
  const { brandId, tenantId } = useBrand();
  const [province, setProvince] = useState<string | null>(null);

  const { data: provinces } = useQuery({
    queryKey: ["pms", "provinces", brandId],
    enabled: !!tenantId,
    queryFn: () => pms.listProvinces({ tenantId: tenantId ?? undefined }),
  });
  const { data: hotels, isLoading } = useQuery({
    queryKey: ["pms", "properties-web", brandId, province],
    enabled: !!tenantId,
    queryFn: () =>
      pms.listProperties({
        tenantId: tenantId ?? undefined,
        ...(province ? { provinceId: province } : {}),
      }),
  });

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Hoteles y habitaciones</h1>
      <p className="mt-1 text-neutral-500">
        Elige hotel para ver sus habitaciones y precios para tus fechas.
      </p>

      {(provinces?.length ?? 0) > 1 && (
        <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1">
          <Chip active={province === null} onClick={() => setProvince(null)} label="Todas" />
          {(provinces ?? []).map((p) => (
            <Chip
              key={p.id}
              active={province === p.id}
              onClick={() => setProvince(p.id)}
              label={`${p.name} (${p.propertyCount})`}
            />
          ))}
        </div>
      )}

      {isLoading && <p className="py-16 text-center text-neutral-400">Cargando…</p>}

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(hotels ?? []).map((c) => (
          <Link
            key={c.id}
            to="/web/hotel/$hotelId"
            params={{ hotelId: c.id }}
            className="group overflow-hidden  bg-white shadow-sm ring-1 ring-neutral-100 transition hover:shadow-md"
          >
            <div
              className="relative h-44 overflow-hidden"
              style={{ background: accentGradient(c.accent) }}
            >
              <HotelCoverArt />
              <div className="absolute inset-0 bg-black/10" />
              <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between text-white">
                <div>
                  <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider opacity-90">
                    <MapPin className="h-3 w-3" /> {c.provinceName} · {c.city}
                  </p>
                  <h3 className="text-lg font-semibold">{c.name}</h3>
                </div>
                <span className="flex items-center gap-1  bg-white/90 px-2 py-0.5 text-xs font-semibold text-neutral-800">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {c.rating.toFixed(1)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="line-clamp-1 pr-2 text-sm text-neutral-500">{c.description}</p>
              {c.fromPrice != null && (
                <span className="shrink-0 text-right text-sm font-semibold">
                  desde {eur0(priceBand(c.fromPrice).from)}
                  <span className="font-normal text-neutral-400">/noche</span>
                  <span className="block text-[10px] font-normal text-neutral-400">
                    según fechas
                  </span>
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0  px-4 py-2 text-sm font-medium transition ${
        active ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200"
      }`}
    >
      {label}
    </button>
  );
}
