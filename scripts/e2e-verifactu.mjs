// End-to-end check of VERI*FACTU invoicing against the demo project (its
// hotels use the simulated AEAT): a simplified invoice from a stay's bill,
// replaced by a full one; a full invoice refused for a wrong tax id, fixed and
// resubmitted; a cancellation; and the chain of fingerprints, checked record
// by record. Test data is removed at the end (only possible in the simulated
// environment).
// Usage: node --env-file=.env scripts/e2e-verifactu.mjs
import { createHash } from "node:crypto";
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
// AEAT fingerprint (same rule as _shared/verifactu/hash.ts).
const huella = (fields) =>
  createHash("sha256")
    .update(fields.map(([k, v]) => `${k}=${(v ?? "").trim()}`).join("&"), "utf8")
    .digest("hex")
    .toUpperCase();

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
const rpc = async (client, fn, args) => {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};

const EMAIL = "verifactu-e2e@example.com";
const stays = [];
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
  const admin = await signIn("admin@lumen.demostays.example");
  // Flow control: the AEAT (here simulated) asks to wait between sends; the
  // test does not want to wait a minute each time.
  const send = async () => {
    await service.from("fiscal_settings").update({ next_send_at: null }).eq("tenant_id", tenant.id);
    const { data, error } = await reception.functions.invoke("verifactu-dispatch", {
      body: { tenant_id: tenant.id },
    });
    if (error) throw new Error(`verifactu-dispatch: ${error.message}`);
    return data.results[tenant.id] ?? {};
  };
  const lastRecord = async (invoiceId) =>
    (
      await service
        .from("verifactu_records")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("seq", { ascending: false })
        .limit(1)
        .single()
    ).data;

  const { data: customer } = await service
    .from("customers")
    .insert({ tenant_id: tenant.id, name: "Prueba VeriFactu", email: EMAIL })
    .select("id")
    .single();
  customerId = customer.id;
  const book = async (days, total) => {
    const { data, error } = await service
      .from("reservations")
      .insert({
        tenant_id: tenant.id,
        room_id: rooms[0].id,
        property_id: rooms[0].property_id,
        customer_id: customer.id,
        start_at: at(days, 13),
        end_at: at(days + 2, 10),
        people: 2,
        status: "completed",
        payment_mode: "at_hotel",
        total,
        created_by_role: "admin",
      })
      .select("id")
      .single();
    if (error) throw error;
    stays.push(data.id);
    return data.id;
  };

  // 1. Simplified invoice from the bill, then replaced by a full one.
  const stay = await book(900, 180);
  await service.from("folio_charges").insert({
    tenant_id: tenant.id,
    reservation_id: stay,
    category: "laundry",
    description: "Lavandería",
    qty: 1,
    unit_price: 12,
  });
  const preview = await rpc(reception, "invoice_preview", { p_reservation: stay });
  check(
    "the bill is previewed with its VAT split",
    Number(preview.totals.total) === 192,
    JSON.stringify(preview.totals),
  );
  const f2 = await rpc(reception, "issue_invoice", { p_reservation: stay, p_recipient: null });
  let r = await send();
  let rec = await lastRecord(f2);
  check(
    "the simplified invoice is registered",
    rec.status === "accepted" && rec.csv?.length === 16,
    JSON.stringify(r),
  );
  const f3 = await rpc(reception, "exchange_simplified_invoice", {
    p_invoice: f2,
    p_recipient: { name: "Viajes Prueba S.A.", nif: "A12345674" },
  });
  await send();
  const { data: invoices } = await service
    .from("tax_invoices")
    .select("id, type, status, number")
    .eq("reservation_id", stay);
  check(
    "it is replaced by a full invoice (F3)",
    invoices.find((i) => i.id === f2)?.status === "replaced" &&
      (await lastRecord(f3)).status === "accepted",
    invoices.map((i) => `${i.type}:${i.status}:${i.number}`).join(" "),
  );

  // 2. A full invoice with a wrong tax id: refused, fixed, resubmitted.
  const stay2 = await book(910, 250);
  const f1 = await rpc(reception, "issue_invoice", {
    p_reservation: stay2,
    p_recipient: { name: "Empresa Errónea S.L.", nif: "A12345675" },
  });
  await send();
  rec = await lastRecord(f1);
  check("a wrong tax id is refused by the AEAT", rec.status === "rejected", rec.error ?? "");
  await rpc(reception, "resubmit_invoice", {
    p_invoice: f1,
    p_recipient: { name: "Empresa Corregida S.L.", nif: "A12345674" },
  });
  await send();
  rec = await lastRecord(f1);
  check(
    "fixed and resubmitted («subsanación» after a refusal)",
    rec.status === "accepted" && rec.subsanacion && rec.rechazo_previo === "X",
  );

  // 3. Management cancels an invoice issued by mistake.
  const denied = await reception.rpc("cancel_invoice", { p_invoice: f1, p_reason: "Error" });
  check("reception cannot cancel invoices", !!denied.error);
  await rpc(admin, "cancel_invoice", { p_invoice: f1, p_reason: "Emitida por error" });
  await send();
  rec = await lastRecord(f1);
  check("the cancellation is registered", rec.kind === "anulacion" && rec.status === "accepted");

  // 4. The chain: every record's fingerprint and link to the previous one.
  const { data: chain } = await service
    .from("verifactu_records")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("environment", "simulated")
    .order("seq");
  let broken = 0;
  chain.forEach((c, i) => {
    const expected =
      c.kind === "alta"
        ? huella([
            ["IDEmisorFactura", c.issuer_nif],
            ["NumSerieFactura", c.invoice_number],
            ["FechaExpedicionFactura", c.issue_date],
            ["TipoFactura", c.invoice_type],
            ["CuotaTotal", c.cuota_total],
            ["ImporteTotal", c.importe_total],
            ["Huella", c.prev_hash],
            ["FechaHoraHusoGenRegistro", c.generated_at],
          ])
        : huella([
            ["IDEmisorFacturaAnulada", c.issuer_nif],
            ["NumSerieFacturaAnulada", c.invoice_number],
            ["FechaExpedicionFacturaAnulada", c.issue_date],
            ["Huella", c.prev_hash],
            ["FechaHoraHusoGenRegistro", c.generated_at],
          ]);
    if (c.hash !== expected || (i > 0 && c.prev_hash !== chain[i - 1].hash)) broken++;
  });
  check(
    "the chain of fingerprints is intact",
    broken === 0 && chain.length >= 5,
    `${chain.length} registros`,
  );

  // 5. Nobody edits an invoice.
  const { error: tamper } = await service.from("tax_invoices").update({ total: 1 }).eq("id", f3);
  check("an issued invoice cannot be changed", !!tamper, tamper?.message);
} catch (e) {
  check("run without errors", false, e.message);
} finally {
  for (const id of stays) {
    await service.rpc("purge_simulated_invoices", { p_reservation: id });
    await service.from("reservations").delete().eq("id", id);
  }
  if (customerId) await service.from("customers").delete().eq("id", customerId);
}
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exitCode = failures ? 1 : 0;
