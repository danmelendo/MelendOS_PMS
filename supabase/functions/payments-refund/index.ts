// POST /payments-refund  { reservation_id, amount }
//
// Gives back money paid online for a booking through the hotel's gateway
// (Redsys or Stripe), from the panel. Caller: reception or management of that
// hotel (Authorization: Bearer <user JWT>; group management cannot operate).
// The refund counts only when the provider accepts it; then it is recorded
// (record_payment_refund) on the payment and the booking.
import { adminClient, corsHeaders, json, verifiedUser } from "../_shared/http.ts";
import { loadGateway } from "../_shared/payments/accounts.ts";
import type { Provider } from "../_shared/payments/gateway.ts";

const round2 = (n: number) => Math.round(n * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { reservation_id?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const amount = round2(Number(body.amount));
  if (!body.reservation_id || !(amount > 0)) {
    return json({ error: "Indica la reserva y un importe mayor que 0" }, 400);
  }

  const db = adminClient();
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: auth } = jwt.split(".").length === 3 ? await verifiedUser(db, jwt) : { data: null };
  const userId = auth?.user?.id ?? null;

  const { data: reservation } = await db
    .from("reservations")
    .select("id, tenant_id")
    .eq("id", body.reservation_id)
    .maybeSingle();
  if (!reservation) return json({ error: "Reserva no encontrada" }, 404);
  const { data: member } = userId
    ? await db
        .from("tenant_members")
        .select("role")
        .eq("tenant_id", reservation.tenant_id)
        .eq("user_id", userId)
        .maybeSingle()
    : { data: null };
  if (!["admin", "reception", "platform"].includes(member?.role ?? "")) {
    return json({ error: "Solo recepción o dirección del hotel pueden devolver pagos" }, 403);
  }

  // Newest payments first (a balance payment before the booking's).
  const { data: payments } = await db
    .from("payments")
    .select("id, provider, provider_ref, amount, refunded_amount")
    .eq("reservation_id", reservation.id)
    .in("status", ["succeeded", "refunded"])
    .in("provider", ["redsys", "stripe"])
    .order("created_at", { ascending: false });
  const rows = (payments ?? []).map((p) => ({
    ...p,
    left: round2(Number(p.amount) - Number(p.refunded_amount)),
  }));
  const refundable = round2(rows.reduce((s, p) => s + p.left, 0));
  if (amount > refundable) {
    return json(
      { error: `Solo se pueden devolver ${refundable.toFixed(2)} € de esta reserva` },
      409,
    );
  }

  let remaining = amount;
  let refunded = 0;
  for (const p of rows) {
    if (remaining <= 0) break;
    const part = round2(Math.min(p.left, remaining));
    if (part <= 0) continue;
    const gateway = await loadGateway(db, reservation.tenant_id, p.provider as Provider);
    const result = await gateway.refund(p.provider_ref, part);
    if (!result.ok) {
      console.error(`payments-refund ${p.id}: ${result.error}`);
      return json(
        {
          error: `La pasarela no ha aceptado la devolución (${result.error ?? "sin detalle"})`,
          refunded,
        },
        502,
      );
    }
    const { error } = await db.rpc("record_payment_refund", {
      p_payment: p.id,
      p_amount: part,
      p_reference: result.reference,
      p_actor: userId,
    });
    if (error) {
      // The money went back: say so, even if recording it failed.
      console.error(`payments-refund record ${p.id}: ${error.message}`);
      return json(
        { error: "Devuelto en la pasarela, pero no se pudo anotar", refunded: refunded + part },
        500,
      );
    }
    refunded = round2(refunded + part);
    remaining = round2(remaining - part);
  }
  return json({ refunded, refundable: round2(refundable - refunded) });
});
