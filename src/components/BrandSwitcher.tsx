import { BRANDS, useBrand, type BrandId } from "@/lib/brand";

// Segmented toggle that swaps the active hotel brand (urban ↔ coast).
// Re-skins the whole surface live via the `--brand` CSS variable. The demo device
// for "one tech base, two brands"; a real build would resolve brand from the
// domain/tenant, not a visible switch.
export function BrandSwitcher({ className = "" }: { className?: string }) {
  const { brandId, setBrand } = useBrand();
  const ids = Object.keys(BRANDS) as BrandId[];

  return (
    <div
      className={`inline-flex items-center rounded-full border border-neutral-200 bg-white/80 p-0.5 ${className}`}
      role="group"
      aria-label="Cambiar de hotel"
    >
      {ids.map((id) => {
        const active = id === brandId;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setBrand(id)}
            aria-pressed={active}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              active ? "text-white" : "text-neutral-500 hover:text-neutral-800"
            }`}
            style={active ? { backgroundColor: BRANDS[id].accent } : undefined}
          >
            {BRANDS[id].short}
          </button>
        );
      })}
    </div>
  );
}
