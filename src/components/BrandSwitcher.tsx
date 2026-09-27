import { useBrand } from "@/lib/brand";

// Demo switcher between the hotels. On a hotel's own domain (or its platform
// subdomain) the hotel is fixed by the host name and this renders nothing.
export function BrandSwitcher({ className = "" }: { className?: string }) {
  const { brandId, setBrand, hotels, locked } = useBrand();
  if (locked || hotels.length < 2) return null;

  return (
    <div
      className={`inline-flex items-center rounded-full border border-neutral-200 bg-white/80 p-0.5 ${className}`}
      role="group"
      aria-label="Cambiar de hotel"
    >
      {hotels.map((h) => {
        const active = h.id === brandId;
        return (
          <button
            key={h.id}
            type="button"
            onClick={() => setBrand(h.id)}
            aria-pressed={active}
            className={`rounded-full px-2 py-1 text-xs sm:px-3 font-semibold transition-colors ${
              active ? "text-white" : "text-neutral-500 hover:text-neutral-800"
            }`}
            style={active ? { backgroundColor: h.accent } : undefined}
          >
            {h.short}
          </button>
        );
      })}
    </div>
  );
}
