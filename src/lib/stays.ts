// Shared presentation helpers for the guest app (/stays) and the public web (/web).
import type {
  BookingStatus,
  AssetType,
  AssetFeature,
  CommonSpaceKind,
  IncidentCategory,
  IncidentStatus,
  InvoiceStatus,
  OccupancyBand,
} from "@/integrations/pms";
import type { EventCategory } from "@/integrations/cms";

export { eur } from "./data";

// Whole-euro formatting for catalogue prices ("95 €" rather than "95,00 €").
export function eur0(n: number | null | undefined) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n ?? 0);
}

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  room: "Habitación",
  suite: "Suite",
  family: "Habitación familiar",
};

// Room features shown as badges.
export const FEATURE_LABELS: Record<AssetFeature, string> = {
  sea_view: "Vistas al mar",
  city_view: "Vistas a la ciudad",
  garden_view: "Vistas al jardín",
  balcony: "Balcón",
  terrace: "Terraza privada",
  bathtub: "Bañera",
  minibar: "Minibar",
  sofa_bed: "Sofá cama",
  ac: "Aire acondicionado",
  wifi: "Wifi",
};

export const ASSET_TYPE_SHORT: Record<AssetType, string> = {
  room: "Habitación",
  suite: "Suite",
  family: "Familiar",
};

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  gastronomy: "Gastronomía",
  wellness: "Bienestar",
  culture: "Cultura",
  outdoor: "Aire libre",
  family: "Familia",
};

export const EVENT_CATEGORY_CLASSES: Record<EventCategory, string> = {
  gastronomy: "bg-amber-100 text-amber-800",
  wellness: "bg-emerald-100 text-emerald-700",
  culture: "bg-violet-100 text-violet-700",
  outdoor: "bg-sky-100 text-sky-700",
  family: "bg-rose-100 text-rose-700",
};

export const AMENITY_LABELS: Record<string, string> = {
  wifi: "Wifi",
  parking: "Parking",
  spa: "Spa",
  bar: "Bar",
  gym: "Gimnasio",
  pool: "Piscina",
  rooftop: "Rooftop",
  restaurant: "Restaurante",
  beach: "Acceso a playa",
  petfriendly: "Pet friendly",
};

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  held: "Prereserva",
  confirmed: "Confirmada",
  in_progress: "En curso",
  completed: "Completada",
  cancelled: "Cancelada",
  expired: "Expirada",
};

export const BOOKING_STATUS_CLASSES: Record<BookingStatus, string> = {
  held: "bg-amber-100 text-amber-800 border-amber-200",
  confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  in_progress: "bg-sky-100 text-sky-800 border-sky-200",
  completed: "bg-slate-100 text-slate-700 border-slate-200",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
  expired: "bg-slate-100 text-slate-500 border-slate-200 line-through",
};

// ── Hotel facilities (instalaciones) ────────────────────────────────────────
export const SPACE_KIND_LABELS: Record<CommonSpaceKind, string> = {
  spa: "Spa",
  gym: "Gimnasio",
  padel: "Pádel",
  meeting: "Sala de reuniones",
  rooftop: "Rooftop",
  pool: "Piscina",
};

// ── Invoices (facturas) ─────────────────────────────────────────────────────
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  paid: "Pagada",
  pending: "Pendiente",
  overdue: "Vencida",
};

export const INVOICE_STATUS_CLASSES: Record<InvoiceStatus, string> = {
  paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  overdue: "bg-rose-100 text-rose-700 border-rose-200",
};

// ── Guest requests (peticiones) ─────────────────────────────────────────────
export const INCIDENT_CATEGORY_LABELS: Record<IncidentCategory, string> = {
  housekeeping: "Limpieza y lencería",
  maintenance: "Mantenimiento",
  climate: "Climatización",
  internet: "Internet / wifi",
  room_service: "Servicio de habitaciones",
  other: "Otros",
};

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Recibida",
  in_progress: "En curso",
  resolved: "Resuelta",
};

export const INCIDENT_STATUS_CLASSES: Record<IncidentStatus, string> = {
  open: "bg-amber-100 text-amber-800 border-amber-200",
  in_progress: "bg-sky-100 text-sky-800 border-sky-200",
  resolved: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

// "10:00" from an integer hour.
export function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

// ── Indeterminate catalogue pricing ─────────────────────────────────────────
// Listings don't show a single fixed price: the real figure depends on dates and
// occupancy (resolved in the price preview). The catalogue instead shows an
// orientation range from the base rate up to a peak factor.
export const PRICE_PEAK_FACTOR = 1.25;

/** A "from–to" orientation band for a base figure. */
export function priceBand(base: number): { from: number; to: number } {
  return { from: base, to: Math.round(base * PRICE_PEAK_FACTOR) };
}

// ── Occupancy band (price preview) ──────────────────────────────────────────
export const OCCUPANCY_LABELS: Record<OccupancyBand, string> = {
  low: "Disponibilidad alta",
  medium: "Ocupación media",
  high: "Ocupación alta",
};

export const OCCUPANCY_CLASSES: Record<OccupancyBand, string> = {
  low: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-rose-100 text-rose-700",
};

// A pleasant gradient derived from a hotel's HSL accent triplet.
export function accentGradient(accent: string): string {
  return `linear-gradient(135deg, hsl(${accent}) 0%, hsl(${accent} / 0.65) 100%)`;
}

export function accentColor(accent: string, alpha = 1): string {
  return alpha === 1 ? `hsl(${accent})` : `hsl(${accent} / ${alpha})`;
}

export function formatDateShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

export function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// yyyy-MM-dd for a date N days from today (for default search dates).
export function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "pagado online" / "se paga en el hotel" for a booking summary. */
export function paymentLabel(b: { paymentMode: "prepay" | "at_hotel"; paidOnline: boolean }) {
  if (b.paymentMode === "at_hotel") return "se paga en el hotel";
  return b.paidOnline ? "pagado online" : "pago online pendiente";
}
