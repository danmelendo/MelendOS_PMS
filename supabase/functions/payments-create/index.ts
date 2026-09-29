// POST /payments-create  { reservation_id, return_url, kind?, token? }
//
// Starts a payment with the hotel's gateway: the whole stay of a pending
// booking paid online (kind "deposit", legacy name, the default) or the
// outstanding balance of the stay's bill (kind "balance": booking total +
// posted charges - paid). The amount always comes from the database, never
// from the client. Bookings paid at the hotel are not charged here. Returns the redirect the browser must follow (auto-posted form for
// Redsys, URL for Stripe). Nothing is confirmed here: confirmation only happens
// in payments-notify, from the provider's verified notification.
// Who may start it: the guest with the booking's access token, the member who
// owns it, or the hotel's staff (session). The return URL must be one of the
// platform's own sites (no open redirect). 20 attempts an hour per IP.
import {
  adminClient,
  clientIp,
  corsHeaders,
  json,
  overLimit,
  tooMany,
  verifiedUser,
} from "../_shared/http.ts";
import { loadGateway } from "../_shared/payments/accounts.ts";

const sha256 = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

/** Sites a payment may return to: the hotel's own, the shared web, and (demo) local ones. */
function returnAllowed(
  url: URL,
  tenant: { domain?: string | null; slug?: string | null },
): boolean {
  if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost"))
    return false;
  const host = url.hostname.toLowerCase();
  const allowed = new Set<string>();
  if (tenant.domain) allowed.add(tenant.domain.toLowerCase());
  for (const v of [
    Deno.env.get("PUBLIC_WEB_URL"),
    ...(Deno.env.get("APP_ORIGINS") ?? "").split(","),
  ]) {
    try {
      if (v?.trim()) allowed.add(new URL(v.trim()).hostname.toLowerCase());
    } catch {
      /* not a URL */
    }
  }
  const platform = Deno.env.get("PLATFORM_DOMAIN")?.toLowerCase();
  if (platform && tenant.slug && host === `${tenant.slug}.${platform}`) return true;
  if (allowed.has(host)) return true;
  // The demo is shown from local servers and quick tunnels.
  if (Deno.env.get("DEMO_ACCESS") === "true")
    return host === "localhost" || host.endsWith(".trycloudflare.com");
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { reservation_id?: string; return_url?: string; kind?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const kind = body.kind === "balance" ? "balance" : "deposit";
  const reservationId = body.reservation_id;
  if (!reservationId || !/^[0-9a-f-]{36}$/i.test(reservationId)) {
    return json({ error: "reservation_id is required" }, 400);
  }
  let returnUrl: URL;
  try {
    returnUrl = new URL(body.return_url ?? "");
  } catch {
    return json({ error: "return_url must be an absolute URL" }, 400);
  }

  const db = adminClient();
  const ip = clientIp(req);
  if (ip && (await overLimit(db, `payments:${ip}`, 20, 3600))) return tooMany();

  const { data: res, error } = await db
    .from("reservations")
    .select(
      "id, tenant_id, status, payment_mode, deposit_paid, deposit_amount, total, is_prebooking, hold_expires_at, member_id, access_token_hash, rooms(name), tenants(name, slug, domain, settings)",
    )
    .eq("id", reservationId)
    .maybeSingle();
  if (error) return json({ error: "Could not load the reservation" }, 500);
  // The same answer for a booking that does not exist and one you cannot pay:
  // nothing about a booking leaves without its token or a session.
  const notFound = () => json({ error: "Reservation not found" }, 404);
  if (!res) return notFound();

  let allowed = false;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (token) {
    const hash = await sha256(token);
    if (res.access_token_hash && res.access_token_hash === hash) allowed = true;
    else {
      const { data: t } = await db
        .from("booking_access_tokens")
        .select("reservation_id")
        .eq("reservation_id", res.id)
        .eq("token_hash", hash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      allowed = !!t;
    }
  }
  if (!allowed) {
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const { data: auth } =
      jwt.split(".").length === 3 ? await verifiedUser(db, jwt) : { data: { user: null } };
    const userId = auth.user?.id;
    if (userId) {
      const [{ data: member }, { data: staff }] = await Promise.all([
        res.member_id
          ? db
              .from("members")
              .select("id")
              .eq("id", res.member_id)
              .eq("user_id", userId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        db
          .from("tenant_members")
          .select("role")
          .eq("tenant_id", res.tenant_id)
          .eq("user_id", userId)
          .in("role", ["admin", "reception", "platform"])
          .maybeSingle(),
      ]);
      allowed = !!member || !!staff;
    }
  }
  if (!allowed) return notFound();

  const tenantInfo = res.tenants as { domain?: string | null; slug?: string | null } | null;
  if (!returnAllowed(returnUrl, tenantInfo ?? {})) {
    return json({ error: "return_url is not one of the hotel's sites" }, 400);
  }
  let amount: number;
  if (kind === "deposit") {
    if (res.payment_mode === "at_hotel") {
      return json({ error: "This booking is paid at the hotel" }, 409);
    }
    if (res.status !== "pending" || res.deposit_paid) {
      return json({ error: "This reservation is not awaiting payment" }, 409);
    }
    if (res.is_prebooking && res.hold_expires_at && new Date(res.hold_expires_at) < new Date()) {
      return json({ error: "The hold on this room has expired" }, 409);
    }
    amount = Number(res.deposit_amount);
    if (!(amount > 0)) return json({ error: "Invalid amount" }, 422);
  } else {
    if (!["confirmed", "in_progress", "completed"].includes(res.status)) {
      return json({ error: "This stay has no bill to settle" }, 409);
    }
    const { data: balance, error: balErr } = await db.rpc("folio_balance", {
      p_reservation_id: res.id,
    });
    if (balErr) return json({ error: "Could not compute the balance" }, 500);
    amount = Math.round(Number(balance) * 100) / 100;
    if (!(amount > 0)) return json({ error: "Nothing to pay" }, 409);
  }

  let gateway;
  try {
    gateway = await loadGateway(db, res.tenant_id);
  } catch (e) {
    return json({ error: (e as Error).message }, 503);
  }

  const { data: payment, error: payErr } = await db
    .from("payments")
    .insert({
      tenant_id: res.tenant_id,
      reservation_id: res.id,
      provider: gateway.provider,
      provider_ref: `pending-${crypto.randomUUID()}`,
      amount,
      kind,
    })
    .select("id")
    .single();
  if (payErr) return json({ error: "Could not create the payment" }, 500);

  const notifyUrl = new URL(`${Deno.env.get("SUPABASE_URL")}/functions/v1/payments-notify`);
  notifyUrl.searchParams.set("tenant", res.tenant_id);
  notifyUrl.searchParams.set("provider", gateway.provider);
  const ok = new URL(returnUrl);
  ok.searchParams.set("payment", "ok");
  ok.searchParams.set("reservation", res.id);
  const ko = new URL(returnUrl);
  ko.searchParams.set("payment", "ko");
  ko.searchParams.set("reservation", res.id);

  const room = (res.rooms as { name?: string } | null)?.name;
  const hotel = (res.tenants as { name?: string } | null)?.name ?? "Hotel";
  try {
    const created = await gateway.createPayment({
      paymentId: payment.id,
      amount,
      currency: "EUR",
      description: `${kind === "balance" ? "Cuenta estancia" : "Reserva"} ${hotel}${room ? ` · hab. ${room}` : ""}`,
      notificationUrl: notifyUrl.toString(),
      okUrl: ok.toString(),
      koUrl: ko.toString(),
    });
    await db.from("payments").update({ provider_ref: created.providerRef }).eq("id", payment.id);
    return json({ payment_id: payment.id, provider: gateway.provider, redirect: created.redirect });
  } catch (e) {
    await db.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return json({ error: `Payment provider error: ${(e as Error).message}` }, 502);
  }
});
