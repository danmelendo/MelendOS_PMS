import { eur0, priceBand } from "@/lib/stays";

// Catalogue price for a hotel or room. Listings show an orientation range per
// night, not a fixed figure, because the real price depends on dates and
// occupancy (resolved in the price preview once the guest picks dates).
export function NightlyPrice({
  night,
  align = "left",
  hint = true,
}: {
  night: number;
  align?: "left" | "right";
  /** Show the "según fechas y ocupación" caption. */
  hint?: boolean;
}) {
  const n = priceBand(night);
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <p className="text-[11px] leading-tight text-neutral-500">desde</p>
      <p className="text-base font-semibold leading-tight text-neutral-900">
        {eur0(n.from)}
        <span className="text-xs font-normal text-neutral-400">/noche</span>
      </p>
      {hint && (
        <p className="text-[10px] leading-tight text-neutral-400">según fechas y ocupación</p>
      )}
    </div>
  );
}
