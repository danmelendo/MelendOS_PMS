// ─────────────────────────────────────────────────────────────────────────────
// Demo seed data — in-memory dataset that replaces the Supabase backend so the
// app can be run and explored WITHOUT any server, credentials or migrations.
//
// The data mirrors the real Postgres schema (see src/integrations/supabase/types.ts)
// but uses plain string ids and anonymised, example values. It is loaded into
// memory and persisted to localStorage so changes (new bookings, edited rates,
// status changes…) survive a page reload. Use resetDemoDb() to wipe it.
// ─────────────────────────────────────────────────────────────────────────────

// The mock is schema-less at runtime: rows are plain JSON objects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type DemoDb = Record<string, Row[]>;

const STORAGE_KEY = "demo-stays-db";
const STORAGE_VERSION = 18; // bump to force a reseed when the shape changes

// Room category, derived from the rate group so the seed stays compact.
function deriveAssetType(groupId: string): "room" | "suite" | "family" {
  if (groupId === "rg-suite") return "suite";
  if (groupId === "rg-family") return "family";
  return "room";
}

// Room features shown as badges, derived from hotel, floor and room type so they
// are stable across reseeds. The first digit of the room number is the floor.
function deriveFeatures(hotel: string, name: string, groupId: string): string[] {
  const floor = Number(name[0]);
  const f = new Set<string>(["wifi", "ac"]);
  if (hotel === "Albora") {
    if (floor >= 2) {
      f.add("sea_view");
      f.add("balcony");
    } else {
      f.add("garden_view");
    }
  } else {
    if (floor >= 2) f.add("city_view");
    if (floor >= 3) f.add("terrace");
  }
  if (groupId === "rg-deluxe" || groupId === "rg-suite") {
    f.add("bathtub");
    f.add("minibar");
  }
  if (groupId === "rg-family") f.add("sofa_bed");
  return [...f];
}

// Illustration per hotel and room category.
function roomImage(hotel: string, groupId: string): string {
  const kind =
    groupId === "rg-suite"
      ? "suite"
      : groupId === "rg-family"
        ? "family"
        : groupId === "rg-deluxe"
          ? "deluxe"
          : groupId === "rg-superior"
            ? "superior"
            : "standard";
  return `/imagenes/rooms/${hotel.toLowerCase()}-${kind}.svg`;
}

export const DEMO_USER_ID = "demo-user-admin";

// Guest identity used by the guest app (/stays). Separate from the
// staff DEMO_USER_ID above: the mobile product authenticates loyalty members, not
// reception/admin users.
export const DEMO_MEMBER_ID = "member-demo-alex";

// ── Rate groups ──────────────────────────────────────────────────────────────
const RATE_GROUPS = [
  { id: "rg-deluxe", name: "Deluxe" },
  { id: "rg-superior", name: "Superior" },
  { id: "rg-standard", name: "Estándar" },
  { id: "rg-classic", name: "Clásica" },
  { id: "rg-family", name: "Familiar" },
  { id: "rg-single", name: "Individual" },
  { id: "rg-economy", name: "Económica" },
  { id: "rg-suite", name: "Junior Suite" },
];

// ── Nightly rates [price, weekend_price Fri/Sat] ─────────────────────────────
// Check-in 15:00 / check-out 12:00, priced per night.
const NIGHTLY: Record<string, [number, number]> = {
  "rg-deluxe": [135, 165],
  "rg-superior": [120, 145],
  "rg-standard": [105, 128],
  "rg-classic": [110, 132],
  "rg-family": [150, 182],
  "rg-single": [85, 102],
  "rg-economy": [75, 90],
  "rg-suite": [195, 235],
};

// ── Rooms ─────────────────────────────────────────────────────────────────────
// [hotel (building), room number, rate_group_id, capacity]
const ROOM_DEFS: [string, string, string, number][] = [
  ["Lumen", "101", "rg-standard", 2],
  ["Lumen", "102", "rg-standard", 2],
  ["Lumen", "103", "rg-single", 1],
  ["Lumen", "104", "rg-economy", 2],
  ["Lumen", "201", "rg-superior", 2],
  ["Lumen", "202", "rg-superior", 2],
  ["Lumen", "203", "rg-deluxe", 2],
  ["Lumen", "204", "rg-deluxe", 2],
  ["Lumen", "301", "rg-suite", 2],
  ["Lumen", "302", "rg-family", 4],
  ["Albora", "101", "rg-economy", 2],
  ["Albora", "102", "rg-classic", 2],
  ["Albora", "103", "rg-classic", 2],
  ["Albora", "104", "rg-standard", 2],
  ["Albora", "201", "rg-superior", 2],
  ["Albora", "202", "rg-superior", 2],
  ["Albora", "203", "rg-deluxe", 2],
  ["Albora", "204", "rg-deluxe", 3],
  ["Albora", "301", "rg-suite", 2],
  ["Albora", "302", "rg-family", 4],
  ["Albora", "303", "rg-family", 4],
];

// ── Extras ─────────────────────────────────────────────────────────────────────
const EXTRAS = [
  {
    id: "ex-breakfast",
    category: "breakfast",
    name: "Desayuno buffet",
    price: 18,
    description: "Por persona y día, de 7:30 a 11:00.",
    sort_order: 1,
  },
  {
    id: "ex-breakfast-room",
    category: "breakfast",
    name: "Desayuno en la habitación",
    price: 24,
    description: "Por persona y día.",
    sort_order: 2,
  },
  {
    id: "ex-parking",
    category: "parking",
    name: "Parking",
    price: 22,
    description: "Por noche, plaza cubierta.",
    sort_order: 3,
  },
  {
    id: "ex-transfer",
    category: "parking",
    name: "Traslado al aeropuerto",
    price: 45,
    description: "Trayecto en coche privado.",
    sort_order: 4,
  },
  {
    id: "ex-spa",
    category: "wellness",
    name: "Circuito spa",
    price: 30,
    description: "Acceso de 90 minutos por persona.",
    sort_order: 5,
  },
  {
    id: "ex-massage",
    category: "wellness",
    name: "Masaje relajante",
    price: 65,
    description: "50 minutos.",
    sort_order: 6,
  },
  {
    id: "ex-late-checkout",
    category: "experiences",
    name: "Late checkout (15:00)",
    price: 35,
    description: "Salida hasta las 15:00, sujeto a disponibilidad.",
    sort_order: 7,
  },
  {
    id: "ex-welcome",
    category: "experiences",
    name: "Detalle de bienvenida",
    price: 25,
    description: "Botella de vino local y fruta en la habitación.",
    sort_order: 8,
  },
  {
    id: "ex-servicio",
    category: "services",
    name: "Servicio personalizado",
    price: 0,
    description: "Precio fijado por recepción.",
    sort_order: 9,
  },
];

// ── Customers ──────────────────────────────────────────────────────────────────
const CUSTOMERS = [
  {
    id: "cust-1",
    name: "Laura Gómez",
    phone: "+34 600 111 222",
    email: "laura@example.com",
    no_contact: false,
    notes: null,
  },
  {
    id: "cust-2",
    name: "Carlos Ruiz",
    phone: "+34 600 333 444",
    email: "carlos@example.com",
    no_contact: false,
    notes: null,
  },
  {
    id: "cust-3",
    name: "María López",
    phone: "+34 600 555 666",
    email: "maria@example.com",
    no_contact: false,
    notes: "Cliente habitual.",
  },
  {
    id: "cust-4",
    name: "Elena Martín",
    phone: null,
    email: "elena@example.com",
    no_contact: true,
    notes: "Prefiere no recibir contacto.",
  },
  {
    id: "cust-5",
    name: "David Sanz",
    phone: "+34 600 777 888",
    email: "david@example.com",
    no_contact: false,
    notes: null,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Hotel catalogue: destinations → hotels → rooms. Each hotel is one tenant /
// brand of the platform: a boutique hotel in the city and a hotel on the coast.
// The guest app and web reach all of this only through the PMS connector
// (src/integrations/pms/), never these rows.
// ─────────────────────────────────────────────────────────────────────────────

// [id, name, hero accent (hsl), tagline]
const PROVINCES: [string, string, string, string][] = [
  ["valencia", "Comunitat Valenciana", "214 51% 25%", "Centro histórico y Mediterráneo"],
  ["costa-blanca", "Costa Blanca", "194 81% 30%", "Calas, sol y pueblos blancos"],
];

// [id, name, province_id, city, address, rating, amenities[], description, brand]
type PropBrand = "urban" | "coast";
const PROPERTY_DEFS: [
  string,
  string,
  string,
  string,
  string,
  number,
  string[],
  string,
  PropBrand,
][] = [
  [
    "prop-lumen",
    "Hotel Lumen",
    "valencia",
    "Valencia",
    "Calle de las Flores, 12",
    4.8,
    ["wifi", "rooftop", "bar", "gym", "petfriendly"],
    "Hotel boutique de 10 habitaciones en el centro histórico, con rooftop y desayuno de producto local.",
    "urban",
  ],
  [
    "prop-albora",
    "Albora Hotel & Spa",
    "costa-blanca",
    "Altea",
    "Paseo del Mediterráneo, 30",
    4.7,
    ["wifi", "spa", "pool", "restaurant", "beach", "parking"],
    "Hotel de costa frente a la bahía de Altea, con spa, pádel y habitaciones con vistas al mar.",
    "coast",
  ],
];

const BUILDING_TO_PROPERTY: Record<string, string> = {
  Lumen: "prop-lumen",
  Albora: "prop-albora",
};

// ── Loyalty club ──────────────────────────────────────────────────────────────
// [id, name, min_points, multiplier (pts per €), perks[]]
const LOYALTY_TIERS: [string, string, number, number, string[]][] = [
  ["tier-bronce", "Bronce", 0, 1, ["1 punto por €", "Check-in exprés"]],
  ["tier-plata", "Plata", 500, 1.25, ["1,25 puntos por €", "Late checkout 13:00", "Wifi premium"]],
  [
    "tier-oro",
    "Oro",
    1500,
    1.5,
    ["1,5 puntos por €", "Upgrade según disponibilidad", "Desayuno incluido"],
  ],
  [
    "tier-platino",
    "Platino",
    4000,
    2,
    ["2 puntos por €", "Upgrade garantizado", "Atención VIP 24/7"],
  ],
];

// [id, name, cost_points, category, description]
const REWARDS: [string, string, number, string, string][] = [
  [
    "rw-latecheckout",
    "Late checkout 14:00",
    300,
    "estancia",
    "Sal con calma: salida ampliada hasta las 14:00.",
  ],
  ["rw-welcome", "Botella de bienvenida", 450, "extra", "Cava frío esperándote en la habitación."],
  [
    "rw-upgrade",
    "Upgrade de habitación",
    900,
    "estancia",
    "Sube de categoría según disponibilidad al llegar.",
  ],
  [
    "rw-night",
    "Noche de regalo",
    2500,
    "estancia",
    "Una noche gratis en cualquier hotel del grupo.",
  ],
];

// ── Hotel facilities (instalaciones) ────────────────────────────────────────
// Guest-bookable facilities, per hotel.
// [id, property_id, name, kind, capacity, description, open_hour, close_hour, €/h]
const COMMON_SPACES: [string, string, string, string, number, string, number, number, number][] = [
  [
    "cs-lumen-rooftop",
    "prop-lumen",
    "Rooftop",
    "rooftop",
    12,
    "Mesa reservada con vistas a los tejados del centro.",
    17,
    24,
    0,
  ],
  [
    "cs-lumen-meeting",
    "prop-lumen",
    "Sala de reuniones",
    "meeting",
    10,
    "Pantalla, videollamada y café incluidos.",
    8,
    20,
    25,
  ],
  [
    "cs-lumen-gym",
    "prop-lumen",
    "Gimnasio",
    "gym",
    6,
    "Cardio y peso libre, abierto a huéspedes.",
    7,
    23,
    0,
  ],
  [
    "cs-albora-spa",
    "prop-albora",
    "Circuito spa",
    "spa",
    8,
    "Piscina termal, sauna y baño turco.",
    10,
    21,
    30,
  ],
  [
    "cs-albora-padel",
    "prop-albora",
    "Pista de pádel",
    "padel",
    4,
    "Pista panorámica; palas y bolas en recepción.",
    8,
    22,
    12,
  ],
  [
    "cs-albora-pool",
    "prop-albora",
    "Piscina exterior",
    "pool",
    40,
    "Tumbona reservada junto a la piscina.",
    10,
    20,
    0,
  ],
];

// ── Guest account data (invoices, requests, facility bookings) ─────────────────
// Populates the guest app on first open. Hotel names are plain labels (a real
// PMS would key these to property ids).
function buildTenantData(now: Date) {
  const day = (off: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + off);
    return d.toISOString().slice(0, 10);
  };

  const invoice = (
    id: string,
    number: string,
    concept: string,
    propertyName: string,
    issuedOff: number,
    dueOff: number,
    amount: number,
    status: string,
    vat = 0.21,
  ): Row => {
    const net = Math.round((amount / (1 + vat)) * 100) / 100;
    return {
      id,
      member_id: DEMO_MEMBER_ID,
      number,
      concept,
      property_name: propertyName,
      issued_at: day(issuedOff),
      due_at: day(dueOff),
      net,
      tax: Math.round((amount - net) * 100) / 100,
      amount,
      status,
    };
  };

  const invoices: Row[] = [
    invoice(
      "inv-stay-past",
      "FAC-2026-0412",
      "Estancia · 1 noche · hab. 202",
      "Hotel Lumen",
      -20,
      -20,
      120,
      "paid",
      0.1,
    ),
    invoice(
      "inv-deposit-next",
      "FAC-2026-0457",
      "Señal reserva · hab. 201",
      "Albora Hotel & Spa",
      0,
      0,
      39,
      "paid",
      0.1,
    ),
    invoice(
      "inv-spa",
      "FAC-2026-0458",
      "Circuito spa · 2 h",
      "Albora Hotel & Spa",
      0,
      14,
      60,
      "pending",
    ),
  ];

  const ts = (off: number, hour = 10) => {
    const d = new Date(now);
    d.setDate(d.getDate() + off);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  const incidents: Row[] = [
    {
      id: "inc-pillow",
      member_id: DEMO_MEMBER_ID,
      property_name: "Hotel Lumen",
      category: "housekeeping",
      title: "Almohada extra y toallas",
      description: "¿Podéis subir una almohada firme y dos toallas más a la 202?",
      status: "resolved",
      created_at: ts(-21, 17),
      updates: [
        { at: ts(-21, 17), status: "resolved", note: "Entregado en la habitación." },
        {
          at: ts(-21, 17),
          status: "open",
          note: "Petición recibida. Recepción la gestionará en breve.",
        },
      ],
    },
    {
      id: "inc-ac",
      member_id: DEMO_MEMBER_ID,
      property_name: "Hotel Lumen",
      category: "climate",
      title: "El aire acondicionado hace ruido",
      description: "Se oye un zumbido por la noche en la 202.",
      status: "resolved",
      created_at: ts(-21, 23),
      updates: [
        {
          at: ts(-20, 10),
          status: "resolved",
          note: "Revisado por mantenimiento; filtro sustituido.",
        },
        {
          at: ts(-21, 23),
          status: "in_progress",
          note: "Mantenimiento lo revisará por la mañana.",
        },
        {
          at: ts(-21, 23),
          status: "open",
          note: "Petición recibida. Recepción la gestionará en breve.",
        },
      ],
    },
  ];

  const space_bookings: Row[] = [
    {
      id: "sp-seed-spa",
      member_id: DEMO_MEMBER_ID,
      space_id: "cs-albora-spa",
      date: day(15),
      start_hour: 17,
      end_hour: 19,
      guests: 2,
      total: 60,
      status: "confirmed",
      created_at: ts(0, 9),
    },
  ];

  return { invoices, incidents, space_bookings };
}

// The seeded demo member, so the mobile app looks alive on first open.
const DEMO_MEMBER = {
  id: DEMO_MEMBER_ID,
  name: "Alex Río",
  email: "alex@stays.example",
  phone: "+34 600 123 456",
  member_number: "ST-2024-0042",
};

function iso(d: Date) {
  return d.toISOString();
}

function at(base: Date, dayOffset: number, hour: number, minute = 0) {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// Reservations are generated relative to "now" so the Today/Calendar views are
// always populated whenever the demo is first opened.
function buildReservations(now: Date) {
  const defs: Array<{
    id: string;
    room_id: string;
    customer_id: string | null;
    start: Date;
    end: Date;
    status: string;
    total: number;
    base: number;
    role: string;
    people?: number;
    deposit_paid?: boolean;
    cleaning?: number;
    extras?: {
      extra_id: string;
      qty: number;
      unit_price: number;
      is_gift?: boolean;
    }[];
  }> = [
    // Departed this morning.
    {
      id: "res-1",
      room_id: "room-lumen-203",
      customer_id: "cust-1",
      start: at(now, -2, 15),
      end: at(now, 0, 12),
      status: "completed",
      total: 314,
      base: 270,
      role: "reception",
      deposit_paid: true,
      extras: [{ extra_id: "ex-parking", qty: 2, unit_price: 22 }],
    },
    // In house: arrived yesterday, leaves tomorrow.
    {
      id: "res-2",
      room_id: "room-lumen-101",
      customer_id: "cust-2",
      start: at(now, -1, 15),
      end: at(now, 1, 12),
      status: "in_progress",
      total: 282,
      base: 210,
      role: "public",
      deposit_paid: true,
      cleaning: 30,
      extras: [{ extra_id: "ex-breakfast", qty: 4, unit_price: 18 }],
    },
    // Arriving today.
    {
      id: "res-3",
      room_id: "room-albora-201",
      customer_id: "cust-3",
      start: at(now, 0, 15),
      end: at(now, 3, 12),
      status: "confirmed",
      total: 385,
      base: 330,
      role: "public",
      deposit_paid: true,
      extras: [
        { extra_id: "ex-welcome", qty: 1, unit_price: 25 },
        { extra_id: "ex-spa", qty: 1, unit_price: 30 },
      ],
    },
    {
      id: "res-4",
      room_id: "room-albora-302",
      customer_id: "cust-5",
      start: at(now, 0, 15),
      end: at(now, 2, 12),
      status: "confirmed",
      total: 300,
      base: 300,
      role: "admin",
      people: 4,
      deposit_paid: true,
    },
    {
      id: "res-5",
      room_id: "room-lumen-203",
      customer_id: "cust-4",
      start: at(now, 1, 15),
      end: at(now, 4, 12),
      status: "confirmed",
      total: 435,
      base: 435,
      role: "public",
      deposit_paid: true,
    },
    {
      id: "res-6",
      room_id: "room-lumen-302",
      customer_id: "cust-1",
      start: at(now, -5, 15),
      end: at(now, -3, 12),
      status: "completed",
      total: 300,
      base: 300,
      role: "reception",
      people: 3,
      deposit_paid: true,
    },
    {
      id: "res-7",
      room_id: "room-albora-203",
      customer_id: "cust-3",
      start: at(now, -4, 15),
      end: at(now, -2, 12),
      status: "completed",
      total: 350,
      base: 220,
      role: "public",
      deposit_paid: true,
      extras: [
        { extra_id: "ex-massage", qty: 2, unit_price: 65 },
        { extra_id: "ex-late-checkout", qty: 1, unit_price: 0, is_gift: true },
      ],
    },
    // Abandoned online payment: pending, no deposit.
    {
      id: "res-8",
      room_id: "room-lumen-102",
      customer_id: null,
      start: at(now, 2, 15),
      end: at(now, 3, 12),
      status: "pending",
      total: 105,
      base: 105,
      role: "public",
      deposit_paid: false,
    },
  ];

  const reservations: Row[] = [];
  const reservationExtras: Row[] = [];

  for (const d of defs) {
    reservations.push({
      id: d.id,
      room_id: d.room_id,
      customer_id: d.customer_id,
      start_at: iso(d.start),
      end_at: iso(d.end),
      people: d.people ?? 2,
      cleaning_minutes: d.cleaning ?? 15,
      base_price: d.base,
      dynamic_surcharge: 0,
      dynamic_reason: null,
      extras_total: (d.extras ?? []).reduce(
        (s, e) => s + (e.is_gift ? 0 : e.qty * e.unit_price),
        0,
      ),
      total: d.total,
      deposit_amount: Math.round(d.total * 0.3 * 100) / 100,
      deposit_paid: d.deposit_paid ?? false,
      paid_amount: d.deposit_paid ? Math.round(d.total * 0.3 * 100) / 100 : 0,
      status: d.status,
      internal_notes: null,
      manual_override: d.role === "admin",
      created_by: null,
      created_by_role: d.role,
      redsys_order: d.deposit_paid ? `DEMO-${d.id}` : null,
      created_at: iso(d.start),
      updated_at: iso(d.start),
    });
    for (const [i, e] of (d.extras ?? []).entries()) {
      reservationExtras.push({
        id: `${d.id}-ex-${i}`,
        reservation_id: d.id,
        extra_id: e.extra_id,
        qty: e.qty,
        unit_price: e.unit_price,
        is_gift: e.is_gift ?? false,
        created_at: iso(d.start),
      });
    }
  }

  return { reservations, reservationExtras };
}

// Bookings, signatures, loyalty ledger and journal for the seeded demo member,
// so the mobile app (trips, club, journal) is populated on first open. Mirrors
// the same `reservations` shape used by reception, plus a `member_id` column the
// connector filters on for "my trips".
function buildMemberData(now: Date, rooms: Row[]) {
  const nowIso = iso(now);
  const roomBy = (id: string) => rooms.find((r) => r.id === id);

  // A past, completed stay at the city hotel and an upcoming one on the coast.
  const pastRoom = roomBy("room-lumen-202")!;
  const nextRoom = roomBy("room-albora-201")!;

  const pastStart = at(now, -21, 15, 0);
  const pastEnd = at(now, -20, 12, 0);
  const nextStart = at(now, 14, 15, 0);
  const nextEnd = at(now, 15, 12, 0);

  const memberReservations: Row[] = [
    {
      id: "res-member-past",
      room_id: pastRoom.id,
      customer_id: null,
      member_id: DEMO_MEMBER_ID,
      property_id: pastRoom.property_id,
      start_at: iso(pastStart),
      end_at: iso(pastEnd),
      people: 2,
      cleaning_minutes: 15,
      base_price: 120,
      dynamic_surcharge: 0,
      dynamic_reason: null,
      extras_total: 0,
      total: 120,
      deposit_amount: 36,
      deposit_paid: true,
      paid_amount: 36,
      status: "completed",
      internal_notes: null,
      manual_override: false,
      is_prebooking: false,
      hold_expires_at: null,
      created_by: null,
      created_by_role: "member",
      redsys_order: "DEMO-member-past",
      created_at: iso(at(now, -28, 12, 0)),
      updated_at: iso(pastEnd),
    },
    {
      id: "res-member-next",
      room_id: nextRoom.id,
      customer_id: null,
      member_id: DEMO_MEMBER_ID,
      property_id: nextRoom.property_id,
      start_at: iso(nextStart),
      end_at: iso(nextEnd),
      people: 2,
      cleaning_minutes: 15,
      base_price: 130,
      dynamic_surcharge: 0,
      dynamic_reason: null,
      extras_total: 0,
      total: 130,
      deposit_amount: 39,
      deposit_paid: true,
      paid_amount: 39,
      status: "confirmed",
      internal_notes: null,
      manual_override: false,
      is_prebooking: false,
      hold_expires_at: null,
      created_by: null,
      created_by_role: "member",
      redsys_order: "DEMO-member-next",
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];
  const memberExtras: Row[] = [];

  // The guest registration was signed at the past stay's check-in.
  const signatures: Row[] = [
    {
      id: "sig-member-past",
      reservation_id: "res-member-past",
      doc_type: "guest_registration",
      signer_name: DEMO_MEMBER.name,
      signature_data: null,
      status: "signed",
      signed_at: iso(pastStart),
      created_at: iso(pastStart),
    },
  ];

  const loyalty_accounts: Row[] = [
    {
      id: "loyalty-demo",
      member_id: DEMO_MEMBER_ID,
      points: 740,
      lifetime_points: 1240,
      tier_id: "tier-plata",
      member_since: iso(at(now, -200, 12, 0)),
      created_at: nowIso,
    },
  ];

  const loyalty_transactions: Row[] = [
    {
      id: "lt-1",
      member_id: DEMO_MEMBER_ID,
      type: "earn",
      points: 150,
      reason: "Estancia · Hotel Lumen",
      reservation_id: "res-member-past",
      created_at: iso(pastEnd),
    },
    {
      id: "lt-2",
      member_id: DEMO_MEMBER_ID,
      type: "earn",
      points: 500,
      reason: "Bono de bienvenida",
      reservation_id: null,
      created_at: iso(at(now, -200, 12, 5)),
    },
    {
      id: "lt-3",
      member_id: DEMO_MEMBER_ID,
      type: "redeem",
      points: -300,
      reason: "Canje · Late checkout 14:00",
      reservation_id: null,
      created_at: iso(at(now, -40, 18, 0)),
    },
    {
      id: "lt-4",
      member_id: DEMO_MEMBER_ID,
      type: "earn",
      points: 390,
      reason: "Estancias anteriores",
      reservation_id: null,
      created_at: iso(at(now, -120, 12, 0)),
    },
  ];

  const je = (
    id: string,
    ref: string,
    propertyId: string | null,
    event: string,
    at_: Date,
    payload: Row = {},
  ): Row => ({
    id,
    booking_ref: ref,
    member_id: DEMO_MEMBER_ID,
    property_id: propertyId,
    event_type: event,
    actor: "member",
    payload,
    created_at: iso(at_),
  });
  const booking_journal: Row[] = [
    je("jr-1", "res-member-past", pastRoom.property_id, "prebooked", at(now, -28, 12, 0), {
      room: pastRoom.name,
    }),
    je("jr-2", "res-member-past", pastRoom.property_id, "confirmed", at(now, -28, 12, 2), {
      deposit: 36,
    }),
    je("jr-3", "res-member-past", pastRoom.property_id, "signed", pastStart, {
      doc: "guest_registration",
    }),
    je("jr-4", "res-member-past", pastRoom.property_id, "checked_in", pastStart, {}),
    je("jr-5", "res-member-past", pastRoom.property_id, "points_earned", pastEnd, { points: 150 }),
    je("jr-6", "res-member-next", nextRoom.property_id, "confirmed", now, {
      room: nextRoom.name,
      deposit: 39,
    }),
  ];

  return {
    memberReservations,
    memberExtras,
    signatures,
    loyalty_accounts,
    loyalty_transactions,
    booking_journal,
  };
}

export function buildSeedDb(): DemoDb {
  const now = new Date();
  const nowIso = iso(now);

  const rate_groups = RATE_GROUPS.map((g) => ({ ...g, created_at: nowIso }));

  const rate_nightly: Row[] = Object.entries(NIGHTLY).map(([groupId, [price, weekend]]) => ({
    id: `rn-${groupId}`,
    rate_group_id: groupId,
    price,
    weekend_price: weekend,
  }));

  const rooms: Row[] = ROOM_DEFS.map(([building, name, groupId, capacity], i) => {
    const slug = `${building}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return {
      id: `room-${slug}`,
      building,
      property_id: BUILDING_TO_PROPERTY[building] ?? null,
      name,
      capacity,
      asset_type: deriveAssetType(groupId),
      features: deriveFeatures(building, name, groupId),
      status: "available",
      rate_group_id: groupId,
      description: null,
      image_url: roomImage(building, groupId),
      has_tv: true,
      active: true,
      sort_order: i,
      created_at: nowIso,
    };
  });

  const provinces: Row[] = PROVINCES.map(([id, name, accent, tagline], i) => ({
    id,
    name,
    accent,
    tagline,
    sort_order: i,
    created_at: nowIso,
  }));

  const properties: Row[] = PROPERTY_DEFS.map(
    ([id, name, provinceId, city, address, rating, amenities, description, brand], i) => ({
      id,
      name,
      province_id: provinceId,
      city,
      address,
      rating,
      amenities,
      description,
      brand,
      image_url: null, // the web derives a hero from the destination accent + first room
      active: true,
      sort_order: i,
      created_at: nowIso,
    }),
  );

  const loyalty_tiers: Row[] = LOYALTY_TIERS.map(([id, name, minPoints, multiplier, perks], i) => ({
    id,
    name,
    min_points: minPoints,
    points_per_euro: multiplier,
    perks,
    sort_order: i,
    created_at: nowIso,
  }));

  const rewards: Row[] = REWARDS.map(([id, name, cost, category, description], i) => ({
    id,
    name,
    cost_points: cost,
    category,
    description,
    active: true,
    sort_order: i,
    created_at: nowIso,
  }));

  const members: Row[] = [{ ...DEMO_MEMBER, created_at: nowIso }];

  const common_spaces: Row[] = COMMON_SPACES.map(
    (
      [id, propertyId, name, kind, capacity, description, openHour, closeHour, pricePerHour],
      i,
    ) => ({
      id,
      property_id: propertyId,
      name,
      kind,
      capacity,
      description,
      open_hour: openHour,
      close_hour: closeHour,
      price_per_hour: pricePerHour,
      active: true,
      sort_order: i,
      created_at: nowIso,
    }),
  );

  const { invoices, incidents, space_bookings } = buildTenantData(now);

  const {
    memberReservations,
    memberExtras,
    signatures,
    loyalty_accounts,
    loyalty_transactions,
    booking_journal,
  } = buildMemberData(now, rooms);

  const extras: Row[] = EXTRAS.map((e) => ({
    ...e,
    active: true,
    image_url: null,
    created_at: nowIso,
  }));

  const gift_thresholds: Row[] = [
    { id: "gt-1", min_extras_total: 80, gift_extra_id: "ex-late-checkout", active: true },
  ];

  const dynamic_rules: Row[] = [
    {
      id: "dr-occ",
      type: "occupancy",
      name: "Alta ocupación",
      config: { threshold: 70 },
      multiplier: 15,
      active: false,
      created_at: nowIso,
    },
    {
      id: "dr-high-season",
      type: "date",
      name: "Temporada alta",
      config: { from: "2027-07-01", to: "2027-08-31" },
      multiplier: 20,
      active: false,
      created_at: nowIso,
    },
  ];

  const customers: Row[] = CUSTOMERS.map((c) => ({ ...c, created_at: nowIso }));

  // Promo codes: a percentage code with no expiry, a fixed single-use code, and
  // an already-expired one so the "Archivados" section has content.
  const promo_codes: Row[] = [
    {
      id: "promo-verano15",
      code: "VERANO15",
      discount_type: "percent",
      discount_value: 15,
      valid_from: nowIso,
      valid_until: null,
      single_use: false,
      max_uses: null,
      times_used: 4,
      active: true,
      archived: false,
      created_at: nowIso,
    },
    {
      id: "promo-bienvenida",
      code: "BIENVENIDA10",
      discount_type: "fixed",
      discount_value: 10,
      valid_from: nowIso,
      valid_until: null,
      single_use: true,
      max_uses: 1,
      times_used: 0,
      active: true,
      archived: false,
      created_at: nowIso,
    },
    {
      id: "promo-navidad",
      code: "NAVIDAD20",
      discount_type: "percent",
      discount_value: 20,
      valid_from: new Date(now.getTime() - 90 * 86_400_000).toISOString(),
      valid_until: new Date(now.getTime() - 30 * 86_400_000).toISOString(),
      single_use: false,
      max_uses: null,
      times_used: 12,
      active: false,
      archived: true,
      created_at: nowIso,
    },
  ];

  const { reservations, reservationExtras } = buildReservations(now);

  // One room kept occupied over the mobile app's default search window
  // (7→8 days out) so the "Avísame cuando se libere" availability-watch flow has
  // something to watch. Cancelling/checking it out from the panel frees the room
  // and fires the guest's notification.
  const watchDemoReservations: Row[] = [
    {
      id: "res-occupied-coral",
      room_id: "room-lumen-102",
      property_id: "prop-lumen",
      customer_id: "cust-2",
      member_id: null,
      start_at: iso(at(now, 7, 15, 0)),
      end_at: iso(at(now, 8, 12, 0)),
      people: 2,
      cleaning_minutes: 15,
      base_price: 105,
      dynamic_surcharge: 0,
      dynamic_reason: null,
      extras_total: 0,
      total: 105,
      deposit_amount: 31.5,
      deposit_paid: true,
      paid_amount: 31.5,
      status: "confirmed",
      internal_notes: "Ocupación demo (para avisos de disponibilidad)",
      manual_override: false,
      is_prebooking: false,
      hold_expires_at: null,
      created_by: null,
      created_by_role: "reception",
      redsys_order: "DEMO-occupied-coral",
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];

  // Occupancy for the price-preview demo: block some rooms over the default
  // discovery window (≈7→14 days out) so the property page shows a live
  // occupancy band and the matching dynamic surcharge.
  const occ = (id: string, roomId: string, propertyId: string, total: number): Row => ({
    id,
    room_id: roomId,
    property_id: propertyId,
    customer_id: null,
    member_id: null,
    start_at: iso(at(now, 7, 15, 0)),
    end_at: iso(at(now, 14, 12, 0)),
    people: 2,
    cleaning_minutes: 15,
    base_price: total,
    dynamic_surcharge: 0,
    dynamic_reason: null,
    extras_total: 0,
    total,
    deposit_amount: Math.round(total * 0.3 * 100) / 100,
    deposit_paid: true,
    paid_amount: Math.round(total * 0.3 * 100) / 100,
    status: "confirmed",
    internal_notes: "Ocupación demo (para previsualización de precio)",
    manual_override: false,
    is_prebooking: false,
    hold_expires_at: null,
    created_by: null,
    created_by_role: "reception",
    redsys_order: `DEMO-${id}`,
    created_at: nowIso,
    updated_at: nowIso,
  });
  const occupancyDemoReservations: Row[] = [
    occ("res-occ-lumen", "room-lumen-104", "prop-lumen", 590),
    occ("res-occ-albora-1", "room-albora-101", "prop-albora", 560),
    occ("res-occ-albora-2", "room-albora-102", "prop-albora", 640),
  ];

  const user_roles: Row[] = [
    { id: "ur-1", user_id: DEMO_USER_ID, role: "admin", created_at: nowIso },
  ];

  return {
    rate_groups,
    rate_nightly,
    rooms,
    extras,
    gift_thresholds,
    dynamic_rules,
    customers,
    promo_codes,
    // Reception-created reservations plus the demo member's mobile bookings share
    // one `reservations` table — the connector filters by `member_id`.
    reservations: [
      ...reservations,
      ...memberReservations,
      ...watchDemoReservations,
      ...occupancyDemoReservations,
    ],
    reservation_extras: [...reservationExtras, ...memberExtras],
    user_roles,
    audit_log: [],
    // ── Mobile app / loyalty domain ──
    provinces,
    properties,
    members,
    loyalty_tiers,
    loyalty_accounts,
    loyalty_transactions,
    rewards,
    signatures,
    booking_journal,
    availability_watches: [],
    // ── Tenant management domain (zonas comunes, facturas, incidencias) ──
    common_spaces,
    space_bookings,
    invoices,
    incidents,
  };
}

// ── Persistence ────────────────────────────────────────────────────────────────
function canPersist() {
  return typeof window !== "undefined" && !!window.localStorage;
}

export function loadDb(): DemoDb {
  if (!canPersist()) return buildSeedDb();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === STORAGE_VERSION && parsed.db) {
        return parsed.db as DemoDb;
      }
    }
  } catch {
    /* fall through to reseed */
  }
  const fresh = buildSeedDb();
  saveDb(fresh);
  return fresh;
}

export function saveDb(db: DemoDb) {
  if (!canPersist()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, db }));
  } catch {
    /* ignore quota / serialization errors */
  }
}

export function resetDemoDb() {
  if (canPersist()) window.localStorage.removeItem(STORAGE_KEY);
}
