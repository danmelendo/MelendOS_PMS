import { describe, expect, it } from "vitest";
import { fakeStore } from "./testing.ts";
import { MAX_CALENDAR_DAYS, priceCalendar } from "./calendar.ts";

const NOW = new Date("2026-09-25T10:00:00Z");
const night = (room_id: string, day: string) => ({
  room_id,
  start_at: `${day}T13:00:00Z`,
  end_at: `${day.slice(0, 8)}${String(Number(day.slice(8)) + 1).padStart(2, "0")}T10:00:00Z`,
});

describe("priceCalendar", () => {
  it("averages one night over the free rooms of the hotel", async () => {
    const { store } = fakeStore({
      busy: [
        night("r-102", "2026-10-01"),
        ...["r-101", "r-102", "r-201"].map((r) => night(r, "2026-10-02")),
      ],
    });
    const { nights } = await priceCalendar(
      store,
      { tenantId: "t1", from: "2026-09-30", days: 4, guests: 2 },
      NOW,
    );
    expect(nights).toEqual([
      // 101 (100), 102 (80) and 201 (200); 301 is out of service, r-x1 is another hotel.
      { date: "2026-09-30", price: 127, min_price: 80, free_rooms: 3 },
      { date: "2026-10-01", price: 150, min_price: 100, free_rooms: 2 },
      { date: "2026-10-02", price: null, min_price: null, free_rooms: 0 },
      { date: "2026-10-03", price: 127, min_price: 80, free_rooms: 3 },
    ]);
  });

  it("prices a single room, or the rooms that fit the guests", async () => {
    const { store } = fakeStore({ busy: [night("r-101", "2026-10-01")] });
    const room = await priceCalendar(
      store,
      { tenantId: "t1", roomId: "r-101", from: "2026-09-30", days: 2, guests: 1 },
      NOW,
    );
    expect(room.nights.map((n) => n.price)).toEqual([100, null]);
    const family = await priceCalendar(
      store,
      { tenantId: "t1", from: "2026-09-30", days: 1, guests: 3 },
      NOW,
    );
    expect(family.nights[0]).toMatchObject({ price: 200, free_rooms: 1 });
  });

  it("never reaches rooms of another hotel", async () => {
    const { store } = fakeStore();
    const other = await priceCalendar(
      store,
      { tenantId: "t1", roomId: "r-x1", from: "2026-09-30", days: 1, guests: 1 },
      NOW,
    );
    expect(other.nights[0].price).toBeNull();
  });

  it("starts today at the earliest and caps the range", async () => {
    const { store } = fakeStore();
    const past = await priceCalendar(
      store,
      { tenantId: "t1", from: "2026-09-20", days: 7, guests: 1 },
      NOW,
    );
    expect(past.nights.map((n) => n.date)).toEqual(["2026-09-25", "2026-09-26"]);
    const long = await priceCalendar(
      store,
      { tenantId: "t1", from: "2026-10-01", days: 400, guests: 1 },
      NOW,
    );
    expect(long.nights).toHaveLength(MAX_CALENDAR_DAYS);
  });
});
