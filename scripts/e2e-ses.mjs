// End-to-end check of the traveller register (SES.HOSPEDAJES) against the
// demo project, whose hotels use the simulated ministry: a booking is
// reported and gets its code, a check-in is blocked until reception records
// every guest and is then reported, and a cancelled booking is withdrawn.
// Test data is removed at the end.
// Usage: node --env-file=.env scripts/e2e-ses.mjs
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
const service = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
};
const at = (days, hour) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

async function signIn(email) {
  const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const c = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });
  const { error: e2 } = await c.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (e2) throw e2;
  return c;
}

const EMAIL = "ses-e2e@example.com";
const queue = async (reservationId) =>
  (
    await service
      .from("ses_communications")
      .select("kind, operation, status, ses_code, error")
      .eq("reservation_id", reservationId)
      .order("created_at")
  ).data ?? [];

let customerId = null;
try {
  const { data: tenant } = await service
    .from("tenants")
    .select("id")
    .eq("slug", "hotel-lumen")
    .single();
  const { data: rooms } = await service
    .from("rooms")
    .select("id, property_id")
    .eq("tenant_id", tenant.id)
    .eq("active", true)
    .gte("capacity", 2)
    .limit(1);
  const reception = await signIn("recepcion@lumen.demostays.example");
  const dispatch = async () => {
    const { data, error } = await reception.functions.invoke("ses-dispatch", {
      body: { tenant_id: tenant.id },
    });
    if (error) throw new Error(`ses-dispatch: ${error.message}`);
    return data.results[tenant.id];
  };

  const { data: customer } = await service
    .from("customers")
    .insert({ tenant_id: tenant.id, name: "Laura Gómez Ruiz", email: EMAIL })
    .select("id")
    .single();
  customerId = customer.id;
  const book = async (days) =>
    (
      await service
        .from("reservations")
        .insert({
          tenant_id: tenant.id,
          room_id: rooms[0].id,
          property_id: rooms[0].property_id,
          customer_id: customer.id,
          start_at: at(days, 13),
          end_at: at(days + 2, 10),
          people: 2,
          status: "confirmed",
          payment_mode: "at_hotel",
          total: 200,
          created_by_role: "admin",
        })
        .select("id")
        .single()
    ).data.id;

  // 1. A booking is reported and gets the ministry's code.
  const stay = await book(700);
  const cancelled = await book(710);
  check(
    "confirmed bookings are queued (RH)",
    (await queue(stay)).map((c) => c.kind + c.status).join() === "RHpending",
  );
  const first = await dispatch();
  check("the dispatcher sends them", first.sent >= 2, JSON.stringify(first));
  await dispatch();
  const [rh] = await queue(stay);
  check("the ministry answers with a code", rh.status === "accepted" && !!rh.ses_code, rh.ses_code);

  // 2. Check-in: blocked until every guest is recorded.
  await service.from("reservations").update({ status: "in_progress" }).eq("id", stay);
  await dispatch();
  const blocked = (await queue(stay)).find((c) => c.kind === "PV");
  check(
    "the check-in report waits for the guests' data",
    blocked?.status === "blocked" && /Faltan 2 de 2/.test(blocked.error),
    blocked?.error,
  );
  const address = {
    address: "Calle Mayor 1",
    municipality_code: "46250",
    postal_code: "46001",
    country: "ESP",
  };
  for (const t of [
    {
      is_holder: true,
      first_name: "Laura",
      last_name1: "Gómez",
      last_name2: "Ruiz",
      document_type: "NIF",
      document_number: "12345678Z",
      document_support: "ABC123456",
      birth_date: "1990-05-01",
      nationality: "ESP",
      email: EMAIL,
      ...address,
    },
    {
      first_name: "Pedro",
      last_name1: "Gómez",
      birth_date: "2018-01-01",
      kinship: "HJ",
      phone: "600000000",
      ...address,
    },
  ]) {
    const { error } = await reception.rpc("save_stay_traveller", {
      p_reservation: stay,
      p_data: t,
    });
    if (error) throw error;
  }
  const { data: list } = await reception.rpc("list_stay_travellers", { p_reservation: stay });
  check(
    "reception sees the guests complete and the document masked",
    list.length === 2 &&
      list.every((t) => t.missing.length === 0) &&
      !JSON.stringify(list).includes("12345678"),
    list.map((t) => t.document_hint).join(),
  );
  const { error: sealed } = await reception.from("stay_travellers").select("id");
  check("reception cannot read the guests' table", !!sealed);
  await dispatch();
  await dispatch();
  const pv = (await queue(stay)).find((c) => c.kind === "PV");
  check("the check-in is reported", pv?.status === "accepted" && !!pv.ses_code, pv?.error ?? "");

  // 3. A reported booking is cancelled: withdrawn with a "B".
  await service.from("reservations").update({ status: "cancelled" }).eq("id", cancelled);
  await dispatch();
  await dispatch();
  const withdrawn = await queue(cancelled);
  check(
    "a cancelled booking is withdrawn",
    withdrawn.map((c) => c.operation + ":" + c.status).join() === "A:cancelled,B:accepted",
    withdrawn.map((c) => c.operation + ":" + c.status).join(),
  );
} catch (e) {
  check("run without errors", false, e.message);
} finally {
  if (customerId) {
    await service.from("reservations").delete().eq("customer_id", customerId);
    await service.from("customers").delete().eq("id", customerId);
  }
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exitCode = failures ? 1 : 0;
