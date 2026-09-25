import {
  UtensilsCrossed,
  HeartPulse,
  Landmark,
  Sailboat,
  Baby,
  type LucideIcon,
} from "lucide-react";
import type { EventCategory } from "@/integrations/cms";

// Decorative cover art so hotel and experience cards aren't just a flat colour band.
// Rendered as translucent white SVG over the existing accent gradient, so it
// adapts to every hotel/category accent without extra image assets.

function Building({
  x,
  y,
  w,
  cols,
  rows,
}: {
  x: number;
  y: number;
  w: number;
  cols: number;
  rows: number;
}) {
  const h = 200 - y;
  const winW = 6;
  const winH = 8;
  const gapX = (w - cols * winW) / (cols + 1);
  const gapY = (h - 14 - rows * winH) / (rows + 1);
  const windows = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      windows.push(
        <rect
          key={`${r}-${c}`}
          x={x + gapX + c * (winW + gapX)}
          y={y + 10 + gapY + r * (winH + gapY)}
          width={winW}
          height={winH}
          fill="white"
          fillOpacity={0.32}
        />,
      );
    }
  }
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="white" fillOpacity={0.16} />
      {windows}
    </g>
  );
}

/** Hotel facade silhouette (with awnings and a flag) for hotel covers. */
export function HotelCoverArt() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <Building x={40} y={120} w={60} cols={3} rows={3} />
      <Building x={120} y={62} w={160} cols={8} rows={6} />
      <Building x={300} y={120} w={60} cols={3} rows={3} />
      {/* entrance canopy and flag on the main building */}
      <g fill="white" fillOpacity={0.3}>
        <rect x={176} y={178} width={48} height={4} />
        <rect x={196} y={182} width={8} height={18} />
        <rect x={198} y={36} width={2} height={26} />
        <polygon points="200,36 222,42 200,48" />
      </g>
    </svg>
  );
}

const EVENT_ICON: Record<EventCategory, LucideIcon> = {
  gastronomy: UtensilsCrossed,
  wellness: HeartPulse,
  culture: Landmark,
  outdoor: Sailboat,
  family: Baby,
};

/** Large translucent category motif for event covers. */
export function EventCoverArt({ category }: { category: EventCategory }) {
  const Icon = EVENT_ICON[category];
  return (
    <Icon
      className="pointer-events-none absolute -bottom-3 -right-2 h-24 w-24 text-white"
      style={{ opacity: 0.22 }}
      strokeWidth={1.25}
      aria-hidden="true"
    />
  );
}
