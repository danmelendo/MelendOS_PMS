// Booking history simulator for the demo hotels (fictitious data).
//
// Generates stays day by day of arrival from a demand curve (season, day of
// week, local events, yearly growth), with realistic lead times, lengths of
// stay, cancellations and no-shows. Deterministic for a given seed.
//
// Used by scripts/simulate-history.ts (demo / pre-production database).
import { addDays, dayOfWeek, eachNight, nightsBetween, type Ymd } from "../domain/dates.ts";
import { round2 } from "../domain/pricing.ts";
import type { CancellationCategory } from "../domain/cancellations.ts";

export type HotelProfile = "urban" | "coastal";

export interface SimRoom {
  id: string;
  tenantId: string;
  propertyId: string;
  capacity: number;
  price: number;
  weekendPrice: number | null;
}

export interface SimInput {
  profile: HotelProfile;
  rooms: SimRoom[];
  /** First and last arrival date to simulate. */
  from: Ymd;
  to: Ymd;
  /** Bookings made after this day do not exist yet. */
  today: Ymd;
  seed: number;
  /** Nights already taken (e.g. the hand-written seed stays). */
  busy?: { roomId: string; checkIn: Ymd; checkOut: Ymd }[];
}

export interface SimStay {
  id: string;
  tenantId: string;
  roomId: string;
  propertyId: string;
  customer: number;
  checkIn: Ymd;
  checkOut: Ymd;
  /** Booking instant (ISO) and cancellation instant, if any. */
  createdAt: string;
  cancelledAt: string | null;
  status: "confirmed" | "in_progress" | "completed" | "cancelled" | "no_show";
  /** Why it was cancelled (cancelled stays only). */
  cancelCategory: CancellationCategory | null;
  channel: "public" | "admin";
  guests: number;
  roomRevenue: number;
  /** Whole stay paid online when booking, or at the hotel. */
  paymentMode: "prepay" | "at_hotel";
  /** Paid online (gateway). */
  paidOnline: boolean;
  paidAmount: number;
}

export interface SimCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
}

// ── Seeded randomness ────────────────────────────────────────────────────────
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)],
    weighted: <T>(items: readonly (readonly [T, number])[]) => {
      const total = items.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [v, w] of items) {
        r -= w;
        if (r <= 0) return v;
      }
      return items[items.length - 1][0];
    },
    poisson(lambda: number) {
      const l = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= next();
      } while (p > l);
      return k - 1;
    },
    exponential: (mean: number) => -Math.log(1 - next()) * mean,
    uuid() {
      const h = Array.from({ length: 16 }, () => Math.floor(next() * 256));
      h[6] = (h[6] & 0x0f) | 0x40;
      h[8] = (h[8] & 0x3f) | 0x80;
      const s = h.map((b) => b.toString(16).padStart(2, "0")).join("");
      return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
    },
  };
}
type Rng = ReturnType<typeof rng>;

// ── Demand model ─────────────────────────────────────────────────────────────
// Target occupancy by month (Jan…Dec).
const SEASON: Record<HotelProfile, number[]> = {
  urban: [0.52, 0.58, 0.76, 0.8, 0.84, 0.82, 0.74, 0.7, 0.85, 0.83, 0.66, 0.62],
  coastal: [0.3, 0.34, 0.45, 0.6, 0.62, 0.8, 0.94, 0.97, 0.82, 0.58, 0.33, 0.36],
};

/** Easter Sunday (Gregorian, Meeus/Jones/Butcher). */
export function easter(year: number): Ymd {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function eventFactor(profile: HotelProfile, day: Ymd): number {
  const md = day.slice(5);
  const year = Number(day.slice(0, 4));
  const e = easter(year);
  const holyWeek = day >= addDays(e, -4) && day <= addDays(e, 1);
  if (profile === "urban") {
    if (md >= "03-15" && md <= "03-19") return 1.3; // Fallas
    if (holyWeek) return 1.12;
    if (md >= "12-05" && md <= "12-08") return 1.15; // December long weekend
    if (md >= "12-29" || md <= "01-01") return 1.2; // New Year
    return 1;
  }
  if (holyWeek) return 1.45;
  if (md >= "08-10" && md <= "08-20") return 1.05;
  if (md >= "12-29" || md <= "01-01") return 1.3;
  return 1;
}

/** Target share of rooms sold on a night. */
/** A number in [0, 1) from a string, without touching the random sequence. */
function hashUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/**
 * Plausible reason for a cancellation: bookings made far ahead are dropped for
 * a better offer or a change of plans; last-minute ones for illness, travel
 * problems or a booking mistake; the coast loses more to the weather.
 */
export function cancellationCategory(
  profile: HotelProfile,
  lead: number,
  key: string,
): CancellationCategory {
  const w: [CancellationCategory, number][] = [
    ["change_of_plans", 30],
    ["personal", lead <= 14 ? 20 : 12],
    ["work", profile === "urban" ? 14 : 6],
    ["travel_disruption", lead <= 7 ? 12 : 5],
    ["found_alternative", lead > 60 ? 24 : 12],
    ["booking_error", lead <= 3 ? 14 : 4],
    ["force_majeure", profile === "urban" ? 2 : 6],
    ["hotel_initiated", 2],
    ["no_reason", 10],
  ];
  let x = hashUnit(key) * w.reduce((t, [, n]) => t + n, 0);
  for (const [c, n] of w) {
    if ((x -= n) < 0) return c;
  }
  return "other";
}

export function demand(profile: HotelProfile, night: Ymd, yearsFromStart: number): number {
  const month = Number(night.slice(5, 7)) - 1;
  const dow = dayOfWeek(night);
  const week = dow === 5 || dow === 6 ? 1.13 : dow === 0 ? 0.82 : 0.97;
  const growth = 1 + 0.04 * yearsFromStart;
  return Math.min(1.1, SEASON[profile][month] * week * eventFactor(profile, night) * growth);
}

const LOS: Record<HotelProfile, readonly (readonly [number, number])[]> = {
  urban: [
    [1, 34],
    [2, 33],
    [3, 18],
    [4, 8],
    [5, 4],
    [7, 3],
  ],
  coastal: [
    [2, 10],
    [3, 18],
    [4, 20],
    [5, 14],
    [6, 10],
    [7, 20],
    [10, 5],
    [14, 3],
  ],
};

function lengthOfStay(r: Rng, profile: HotelProfile, arrival: Ymd): number {
  const los = r.weighted(LOS[profile]);
  const month = Number(arrival.slice(5, 7));
  // Off-season coastal stays are shorter (weekend breaks).
  if (profile === "coastal" && (month <= 3 || month >= 11)) return Math.max(2, Math.round(los / 2));
  return los;
}

function leadDays(r: Rng, profile: HotelProfile, arrival: Ymd): number {
  if (r.next() < 0.08) return r.int(0, 1); // last minute
  const month = Number(arrival.slice(5, 7));
  const mean = profile === "urban" ? 18 : month >= 6 && month <= 9 ? 75 : 35;
  return Math.min(300, Math.round(r.exponential(mean)));
}

const meanLos = (profile: HotelProfile) => {
  const w = LOS[profile];
  return w.reduce((s, [v, p]) => s + v * p, 0) / w.reduce((s, [, p]) => s + p, 0);
};

// ── Prices ───────────────────────────────────────────────────────────────────
/** Nightly price: weekend rate on Fri/Sat, higher when demand is high. */
export function nightlyPrice(room: SimRoom, night: Ymd, demandLevel: number, years: number) {
  const dow = dayOfWeek(night);
  const base = (dow === 5 || dow === 6) && room.weekendPrice ? room.weekendPrice : room.price;
  const yield_ = 0.85 + 0.35 * Math.min(1, demandLevel);
  return Math.round(base * yield_ * (1 + 0.03 * years));
}

// ── Guests ───────────────────────────────────────────────────────────────────
const FIRST = [
  "Lucía",
  "Hugo",
  "Martina",
  "Daniel",
  "Sofía",
  "Pablo",
  "Julia",
  "Álvaro",
  "Paula",
  "Adrián",
  "Valeria",
  "Mario",
  "Carla",
  "Diego",
  "Noa",
  "Javier",
  "Emma",
  "Marcos",
  "Claudia",
  "Sergio",
  "Anna",
  "Thomas",
  "Chloé",
  "Lukas",
  "Giulia",
  "Oliver",
  "Sarah",
  "Jan",
  "Inès",
  "Matteo",
];
const LAST = [
  "García",
  "Martínez",
  "López",
  "Sánchez",
  "Pérez",
  "Gómez",
  "Martín",
  "Jiménez",
  "Ruiz",
  "Hernández",
  "Díaz",
  "Moreno",
  "Muñoz",
  "Álvarez",
  "Romero",
  "Navarro",
  "Torres",
  "Domínguez",
  "Vidal",
  "Ferrer",
  "Müller",
  "Dubois",
  "Rossi",
  "Smith",
  "Jansen",
  "Nielsen",
  "Costa",
  "Moreau",
];

const ascii = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function simCustomers(seed: number, count: number): SimCustomer[] {
  const r = rng(seed ^ 0x5eed);
  return Array.from({ length: count }, (_, i) => {
    const first = r.pick(FIRST);
    const last = r.pick(LAST);
    return {
      id: r.uuid(),
      name: `${first} ${last}`,
      email: `${ascii(first)}.${ascii(last)}.${i + 1}@example.com`,
      phone: `+34 6${String(r.int(0, 99_999_999)).padStart(8, "0")}`,
    };
  });
}

// ── Simulation ───────────────────────────────────────────────────────────────
const at = (day: Ymd, hour: number, minute: number) =>
  `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`;

export function simulateHistory(input: SimInput): { stays: SimStay[]; customers: number } {
  const r = rng(input.seed);
  const rooms = input.rooms;
  const taken = new Map<string, Set<Ymd>>(rooms.map((x) => [x.id, new Set<Ymd>()]));
  for (const b of input.busy ?? []) {
    for (const n of eachNight(b.checkIn, b.checkOut)) taken.get(b.roomId)?.add(n);
  }

  const cancelBase = input.profile === "urban" ? 0.13 : 0.17;
  const years = (d: Ymd) => Math.max(0, nightsBetween(input.from, d) / 365);
  const stays: SimStay[] = [];
  let customers = 0;
  const repeat = () => (customers > 20 && r.next() < 0.18 ? r.int(0, customers - 1) : customers++);

  for (let arrival = input.from; arrival <= input.to; arrival = addDays(arrival, 1)) {
    const level = demand(input.profile, arrival, years(arrival));
    // Gross requests: net target / mean stay, grossed up for cancellations and
    // for requests that find no free room (long stays leave gaps).
    const lambda = (1.12 * rooms.length * level) / meanLos(input.profile) / (1 - cancelBase);
    const requests = r.poisson(lambda);
    for (let q = 0; q < requests; q++) {
      const lead = leadDays(r, input.profile, arrival);
      const created = addDays(arrival, -lead);
      if (created > input.today) continue; // not booked yet
      const los = lengthOfStay(r, input.profile, arrival);
      const checkOut = addDays(arrival, los);
      const guests = r.weighted([
        [1, input.profile === "urban" ? 25 : 8],
        [2, 60],
        [3, 8],
        [4, 7],
      ] as const);
      const nights = eachNight(arrival, checkOut);

      const channel = r.next() < 0.7 ? "public" : "admin";
      let cancelP = cancelBase + (lead > 60 ? 0.08 : 0) - (channel === "admin" ? 0.05 : 0);
      if (lead <= 1) cancelP = 0.02;
      const willCancel = r.next() < cancelP;
      const createdAt = at(created, r.int(7, 22), r.int(0, 59));
      let cancelledAt: string | null = null;
      if (willCancel) {
        const span = Math.max(0, nightsBetween(created, arrival) - 1);
        const cancelDay = addDays(created, Math.floor(span * Math.pow(r.next(), 0.6)));
        if (cancelDay <= input.today) {
          cancelledAt = at(cancelDay, r.int(8, 22), r.int(0, 59));
          if (cancelledAt < createdAt) cancelledAt = createdAt;
        }
      }

      // Rooms that fit, cheapest first with some randomness; first free one.
      const candidates = rooms
        .filter((x) => x.capacity >= guests)
        .map((x) => ({ x, k: x.price * (0.75 + r.next() * 0.5) }))
        .sort((a, b) => a.k - b.k)
        .map((c) => c.x);
      const room = candidates.find((x) => nights.every((n) => !taken.get(x.id)!.has(n)));
      if (!room) continue; // sold out: demand lost

      const revenue = nights.reduce(
        (s, n) => s + nightlyPrice(room, n, demand(input.profile, n, years(n)), years(n)),
        0,
      );

      let status: SimStay["status"];
      if (cancelledAt) status = "cancelled";
      else if (checkOut < input.today) status = r.next() < 0.025 ? "no_show" : "completed";
      else if (arrival < input.today || checkOut === input.today) status = "in_progress";
      else status = "confirmed";

      if (status !== "cancelled" && status !== "no_show") {
        for (const n of nights) taken.get(room.id)!.add(n);
      }
      // Reception and phone bookings are paid at the hotel; online, a share
      // of guests prepay. Prepaid cancellations are refunded; at the hotel the
      // stay is paid on arrival.
      const paymentMode: SimStay["paymentMode"] =
        channel === "admin" || r.next() < (input.profile === "urban" ? 0.45 : 0.4)
          ? "at_hotel"
          : "prepay";
      const paidOnline = paymentMode === "prepay";
      const paidAmount =
        status === "cancelled" || status === "no_show"
          ? 0
          : paymentMode === "prepay" || status === "completed" || status === "in_progress"
            ? revenue
            : 0;
      const cancelCategory =
        status === "cancelled"
          ? cancellationCategory(input.profile, lead, `${room.id}${createdAt}${arrival}`)
          : null;
      stays.push({
        id: r.uuid(),
        tenantId: room.tenantId,
        roomId: room.id,
        propertyId: room.propertyId,
        customer: repeat(),
        checkIn: arrival,
        checkOut,
        createdAt,
        cancelledAt,
        status,
        cancelCategory,
        channel,
        guests,
        roomRevenue: revenue,
        paymentMode,
        paidOnline,
        paidAmount,
      });
    }
  }
  return { stays, customers };
}

// ── Reviews ──────────────────────────────────────────────────────────────────
export interface SimReview {
  stayId: string;
  rating: number;
  scores: Record<string, number>;
  comment: string | null;
  createdAt: string;
}

const COMMENTS: Record<HotelProfile, Record<"good" | "ok" | "bad", string[]>> = {
  urban: {
    good: [
      "Ubicación inmejorable, a dos pasos de todo. La habitación impecable y el personal muy atento.",
      "Repetiremos. El desayuno con producto local es un acierto y la terraza al atardecer, preciosa.",
      "Todo perfecto: check-in rápido, cama comodísima y muy silencioso para estar en el centro.",
      "Nos recomendaron sitios para comer que fueron un acierto. Trato cercano y profesional.",
      "Great location in the old town, spotless room and very friendly staff.",
    ],
    ok: [
      "Buena relación calidad-precio. La habitación algo pequeña, pero muy bien aprovechada.",
      "Bien situado y limpio. El desayuno podría tener algo más de variedad.",
      "Correcto en general; el aire acondicionado hacía algo de ruido por la noche.",
    ],
    bad: [
      "La habitación daba a la calle y hubo bastante ruido el fin de semana.",
      "El check-in se retrasó y la habitación no estaba lista a la hora.",
    ],
  },
  coastal: {
    good: [
      "Las vistas al mar desde la habitación son espectaculares. El spa, una maravilla.",
      "Vacaciones perfectas en familia: piscina, playa al lado y un personal encantador.",
      "Desayuno buenísimo en la terraza y la bahía de Altea al fondo. Volveremos seguro.",
      "Muy tranquilo, ideal para desconectar. El circuito de spa merece mucho la pena.",
      "Amazing sea views, lovely spa and very helpful staff. Highly recommended.",
    ],
    ok: [
      "Hotel bonito y bien cuidado. En agosto la piscina estaba muy llena.",
      "Buena estancia; el aparcamiento es algo justo en temporada alta.",
      "Todo correcto, aunque el restaurante nos pareció algo caro.",
    ],
    bad: [
      "Nos dieron una habitación sin vistas al mar pese a haberla pedido.",
      "El wifi fallaba mucho en las habitaciones de la segunda planta.",
    ],
  },
};

/** Reviews left by some guests after a completed stay. */
export function simReviews(
  stays: SimStay[],
  profile: HotelProfile,
  seed: number,
  today: Ymd,
): SimReview[] {
  const r = rng(seed ^ 0xbeef);
  const out: SimReview[] = [];
  for (const s of stays) {
    if (s.status !== "completed" || r.next() > 0.3) continue;
    const rating = r.weighted([
      [5, 52],
      [4, 32],
      [3, 10],
      [2, 4],
      [1, 2],
    ] as const);
    const around = (bias = 0) => Math.max(1, Math.min(5, rating + bias + r.int(-1, 1)));
    const scores: Record<string, number> = {
      cleanliness: around(),
      staff: around(r.next() < 0.3 ? 1 : 0),
      location: around(profile === "urban" ? 1 : 0),
      comfort: around(),
      value: around(-(r.next() < 0.3 ? 1 : 0)),
    };
    const mood = rating >= 4 ? "good" : rating === 3 ? "ok" : "bad";
    const day = addDays(s.checkOut, r.int(0, 10));
    if (day > today) continue;
    out.push({
      stayId: s.id,
      rating,
      scores,
      comment: r.next() < 0.8 ? r.pick(COMMENTS[profile][mood]) : null,
      createdAt: at(day, r.int(9, 22), r.int(0, 59)),
    });
  }
  return out;
}
