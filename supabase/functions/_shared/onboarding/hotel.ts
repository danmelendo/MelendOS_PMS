// A new hotel described in one JSON file (scripts/create-hotel.ts): the hotel,
// its policies and packages, its establishments, rooms and nightly rates, and
// who manages it. Validated here, pure, so the platform can check a file
// before touching the database. The texts and photos of its web are then
// edited by the hotel in the panel (Web y dominio).
import { z } from "zod";
import { PACKAGE_IDS } from "../domain/features.ts";

const text = (max: number) => z.string().trim().min(1).max(max);
const price = z.number().positive().max(100_000);

export const hotelSpec = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]{3,40}$/, "slug: minúsculas, números y guiones (3-40)"),
    name: text(80),
    plan: z.enum(["starter", "pro", "group"]).default("starter"),
    /** Packages bought; without it, those of the plan. */
    packages: z.array(z.enum(PACKAGE_IDS)).optional(),
    status: z.enum(["trial", "active"]).default("trial"),
    domain: z
      .string()
      .regex(/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, "dominio no válido")
      .optional(),
    timezone: z.string().default("Europe/Madrid"),
    checkin_hour: z.number().int().min(0).max(23).default(15),
    checkout_hour: z.number().int().min(0).max(23).default(12),
    payment_modes: z
      .array(z.enum(["prepay", "at_hotel"]))
      .min(1)
      .default(["prepay", "at_hotel"]),
    free_cancellation_hours: z.number().int().min(0).max(720).default(48),
    cancellation_penalty: z.enum(["none", "first_night", "full"]).default("first_night"),
    brand: z
      .object({
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        tagline: text(160),
        email: z.string().email(),
        phone: text(40),
        address: text(200),
      })
      .partial()
      .default({}),
    /** Management: they get an invitation to choose their password. */
    admins: z.array(z.string().trim().toLowerCase().email()).min(1),
    reception: z.array(z.string().trim().toLowerCase().email()).default([]),
    rates: z.array(z.object({ name: text(60), price, weekend_price: price.optional() })).min(1),
    properties: z
      .array(
        z.object({
          name: text(80),
          city: text(80),
          address: text(200).optional(),
          province: text(80).optional(),
          description: text(1000).optional(),
          amenities: z.array(text(30)).default([]),
          rooms: z
            .array(
              z.object({
                name: text(20),
                capacity: z.number().int().min(1).max(12),
                type: z.enum(["room", "suite", "family"]).default("room"),
                rate: text(60),
                building: text(40).optional(),
                features: z.array(text(30)).default([]),
              }),
            )
            .min(1)
            .max(500),
        }),
      )
      .min(1),
  })
  .superRefine((h, ctx) => {
    const rates = new Set<string>();
    h.rates.forEach((r, i) => {
      if (rates.has(r.name))
        ctx.addIssue({
          code: "custom",
          path: ["rates", i, "name"],
          message: `tarifa repetida: ${r.name}`,
        });
      rates.add(r.name);
    });
    h.properties.forEach((p, pi) => {
      const names = new Set<string>();
      p.rooms.forEach((r, ri) => {
        if (names.has(r.name))
          ctx.addIssue({
            code: "custom",
            path: ["properties", pi, "rooms", ri, "name"],
            message: `habitación repetida en ${p.name}: ${r.name}`,
          });
        names.add(r.name);
        if (!rates.has(r.rate))
          ctx.addIssue({
            code: "custom",
            path: ["properties", pi, "rooms", ri, "rate"],
            message: `la habitación ${r.name} usa una tarifa que no existe: ${r.rate}`,
          });
      });
    });
    const people = [...h.admins, ...h.reception];
    if (new Set(people).size !== people.length)
      ctx.addIssue({ code: "custom", path: ["reception"], message: "un email está repetido" });
    try {
      new Intl.DateTimeFormat("es-ES", { timeZone: h.timezone });
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["timezone"],
        message: `zona horaria no válida: ${h.timezone}`,
      });
    }
  });

export type HotelSpec = z.output<typeof hotelSpec>;

/** tenants.settings of the new hotel. */
export function hotelSettings(h: HotelSpec): Record<string, unknown> {
  return {
    checkin_hour: h.checkin_hour,
    checkout_hour: h.checkout_hour,
    currency: "EUR",
    timezone: h.timezone,
    payment: { modes: h.payment_modes, default: h.payment_modes[0] },
    cancellation: { free_hours: h.free_cancellation_hours, penalty: h.cancellation_penalty },
    ...(h.packages ? { packages: h.packages } : {}),
  };
}

/** Readable problems of a file, one per line. */
export function specProblems(raw: unknown): string[] {
  const r = hotelSpec.safeParse(raw);
  return r.success
    ? []
    : r.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`);
}
