import { describe, expect, it } from "vitest";
import { hotelPolicies } from "../domain/policies.ts";
import { requestExtension, type ExtensionStore } from "./extensions.ts";

const NOW = new Date("2026-09-25T10:00:00Z");

function fakeStore(busy: { room_id: string; start_at: string; end_at: string }[] = []) {
  const extensions: unknown[] = [];
  const messages: string[] = [];
  let pending = false;
  const store: ExtensionStore = {
    async getRoom(id) {
      return {
        id,
        tenant_id: "t1",
        property_id: "p1",
        name: "101",
        capacity: 2,
        status: "occupied",
        active: true,
        rate_group_id: "rg",
      };
    },
    async getTenantSettings() {
      return {
        checkin_hour: 15,
        checkout_hour: 12,
        timezone: "Europe/Madrid",
        policies: hotelPolicies({ payment: { modes: ["prepay", "at_hotel"] } }),
      };
    },
    async getBusyWindows() {
      return busy;
    },
    async countActiveRooms() {
      return 10;
    },
    async getRate() {
      return { price: 100, weekend_price: 130 };
    },
    async getActiveRules() {
      return [];
    },
    async getActiveGifts() {
      return [];
    },
    async getExtras() {
      return [];
    },
    async findMember() {
      return null;
    },
    async findOrCreateCustomer() {
      return "c1";
    },
    async findPromoCode() {
      return null;
    },
    async claimPromoCode() {
      return false;
    },
    async insertReservation() {
      throw new Error("not used");
    },
    async insertExtras() {},
    async insertExtension(row) {
      if (pending) return "already_pending";
      pending = true;
      extensions.push(row);
      return { id: "ext-1" };
    },
    async notify(_t, _r, body) {
      messages.push(body);
    },
  };
  return { store, extensions, messages };
}

// In house from Tue 29 Sep to Thu 1 Oct 2026 (check-out 12:00 CEST).
const stay = {
  id: "res-1",
  tenant_id: "t1",
  room_id: "room-1",
  status: "in_progress",
  end_at: "2026-10-01T10:00:00Z",
  people: 2,
};
// The guest's own stay, as the busy windows report it.
const own = { room_id: "room-1", start_at: "2026-09-29T13:00:00Z", end_at: "2026-10-01T10:15:00Z" };

describe("requestExtension", () => {
  it("prices the extra nights in the same room and tells reception", async () => {
    const { store, extensions, messages } = fakeStore([own]);
    const q = await requestExtension(
      store,
      stay,
      { reservation_id: "res-1", new_check_out: "2026-10-03" },
      NOW,
    );
    // Thu 100 + Fri 130
    expect(q).toEqual({ id: "ext-1", new_check_out: "2026-10-03", nights: 2, amount: 230 });
    expect(extensions[0]).toMatchObject({
      reservation_id: "res-1",
      nights: 2,
      amount: 230,
      new_end_at: "2026-10-03T10:00:00.000Z", // 12:00 CEST
    });
    expect(messages[0]).toMatch(/2 noches más, 230,00 €/);
  });

  it("refuses nights that are already taken", async () => {
    const next = {
      room_id: "room-1",
      start_at: "2026-10-02T13:00:00Z",
      end_at: "2026-10-04T10:00:00Z",
    };
    const { store, extensions } = fakeStore([own, next]);
    await expect(
      requestExtension(store, stay, { reservation_id: "res-1", new_check_out: "2026-10-03" }, NOW),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(extensions).toHaveLength(0);
  });

  it("validates dates, status and one pending request at a time", async () => {
    const { store } = fakeStore([own]);
    const ask = (input: object, r = stay) => requestExtension(store, r, input, NOW);
    await expect(
      ask({ reservation_id: "res-1", new_check_out: "2026-10-01" }),
    ).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(
      ask({ reservation_id: "res-1", new_check_out: "2026-10-30" }),
    ).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(
      ask(
        { reservation_id: "res-1", new_check_out: "2026-10-02" },
        { ...stay, status: "completed" },
      ),
    ).rejects.toMatchObject({ code: "invalid" });
    await ask({ reservation_id: "res-1", new_check_out: "2026-10-02" });
    await expect(ask({ reservation_id: "res-1", new_check_out: "2026-10-02" })).rejects.toThrow(
      /pendiente/,
    );
  });
});
