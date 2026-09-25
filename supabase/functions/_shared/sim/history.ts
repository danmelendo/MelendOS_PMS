// Booking history simulator for the demo hotels (fictitious data).
//
// Generates stays day by day of arrival from a demand curve (season, day of
// week, local events, yearly growth), with realistic lead times, lengths of
// stay, cancellations and no-shows. Deterministic for a given seed, so the
// browser mock and the demo database get the same history.
//
// Used by scripts/simulate-history.ts (database) and the mock seed.
import { addDays, dayOfWeek, eachNight, nightsBetween, type Ymd } from "../domain/dates.ts";
import { round2 } from "../domain/pricing.ts";

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
  depositPct?: number;
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
  channel: "public" | "admin";
  guests: number;
  roomRevenue: number;
  deposit: number;
  depositPaid: boolean;
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
  const depositPct = input.depositPct ?? 30;
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
      const deposit = round2((revenue * depositPct) / 100);

      let status: SimStay["status"];
      if (cancelledAt) status = "cancelled";
      else if (checkOut < input.today) status = r.next() < 0.025 ? "no_show" : "completed";
      else if (arrival < input.today || checkOut === input.today) status = "in_progress";
      else status = "confirmed";

      if (status !== "cancelled" && status !== "no_show") {
        for (const n of nights) taken.get(room.id)!.add(n);
      }
      const depositPaid = status === "cancelled" ? r.next() < 0.5 : true;
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
        channel,
        guests,
        roomRevenue: revenue,
        deposit,
        depositPaid,
        paidAmount: status === "completed" ? revenue : depositPaid ? deposit : 0,
      });
    }
  }
  return { stays, customers };
}
