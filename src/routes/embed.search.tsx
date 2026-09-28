import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, Search } from "lucide-react";
import { pms } from "@/integrations/pms";
import { DateRangePicker } from "@/components/DateRangePicker";
import { useBrand } from "@/lib/brand";
import { dateOffset } from "@/lib/stays";
import { postToHost, useTransparentPage } from "@/lib/embed";

// The search box of the widget on the hotel's own website (public/embed.js
// puts it in an iframe). "Buscar" takes the guest to the booking web with
// the dates already chosen.
export const Route = createFileRoute("/embed/search")({
  component: EmbedSearch,
});

function EmbedSearch() {
  const { brand, tenantId, ready } = useBrand();
  useTransparentPage();
  const { data: properties } = useQuery({
    queryKey: ["pms", "properties-embed", tenantId],
    enabled: !!tenantId,
    queryFn: () => pms.listProperties({ tenantId: tenantId ?? undefined }),
  });
  const [property, setProperty] = useState<string | null>(null);
  const [dates, setDates] = useState({ checkIn: dateOffset(7), checkOut: dateOffset(9) });
  const [guests, setGuests] = useState(2);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const chosen = property ?? properties?.[0]?.id ?? null;

  // The host page sizes the iframe to the content, and makes room for the
  // calendar while it is open.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const report = () =>
      postToHost({
        type: "melendos:height",
        height: calendarOpen ? Math.max(el.scrollHeight, 480) : el.scrollHeight,
      });
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [calendarOpen, ready, properties?.length]);

  const search = () => {
    if (!chosen) return;
    const url = new URL(`/web/hotel/${chosen}`, window.location.origin);
    url.searchParams.set("checkIn", dates.checkIn);
    url.searchParams.set("checkOut", dates.checkOut);
    url.searchParams.set("guests", String(guests));
    url.searchParams.set("hotel", brand.id);
    if (!postToHost({ type: "melendos:navigate", url: url.toString() }))
      window.location.href = url.toString();
  };

  if (!ready) return null;
  return (
    <div ref={root} className="p-1">
      <div className="flex flex-wrap items-stretch gap-2 bg-white p-2 shadow-sm ring-1 ring-neutral-200">
        {properties && properties.length > 1 && (
          <select
            value={chosen ?? ""}
            onChange={(e) => setProperty(e.target.value)}
            className="min-w-40 flex-1 border border-neutral-200 bg-white px-3 text-sm"
            aria-label="Hotel"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <div className="min-w-56 flex-[2]">
          <DateRangePicker
            checkIn={dates.checkIn}
            checkOut={dates.checkOut}
            onChange={setDates}
            onOpenChange={setCalendarOpen}
            pricing={tenantId ? { tenantId, guests } : undefined}
          />
        </div>
        <div
          className="flex items-center gap-1 border border-neutral-200 px-2"
          aria-label="Personas"
        >
          <button
            type="button"
            onClick={() => setGuests((g) => Math.max(1, g - 1))}
            disabled={guests <= 1}
            className="p-1 disabled:opacity-30"
            aria-label="Menos personas"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-20 whitespace-nowrap text-center text-sm tabular-nums">
            {guests} {guests === 1 ? "persona" : "personas"}
          </span>
          <button
            type="button"
            onClick={() => setGuests((g) => Math.min(8, g + 1))}
            disabled={guests >= 8}
            className="p-1 disabled:opacity-30"
            aria-label="Más personas"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={search}
          disabled={!chosen}
          className="flex flex-1 items-center justify-center gap-2 bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:flex-none"
        >
          <Search className="h-4 w-4" /> Buscar
        </button>
      </div>
    </div>
  );
}
