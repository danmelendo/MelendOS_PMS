// The hotel facts the booking agent's prompt needs, read from the database.
// Shared by the agent-chat function and the agent evals, so both use exactly
// the same prompt.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ymdInZone } from "../domain/dates.ts";
import { systemPrompt } from "./prompt.ts";
import { cancellationSummary, hotelPolicies, PAYMENT_MODE_LABELS } from "../domain/policies.ts";

export async function agentSystemPrompt(
  db: SupabaseClient,
  tenantId: string,
  now = new Date(),
  suffix?: string,
): Promise<string> {
  const [{ data: tenant }, { data: properties }, { data: groups }] = await Promise.all([
    db.from("tenants").select("name, settings").eq("id", tenantId).single(),
    db.from("properties").select("name, city").eq("tenant_id", tenantId).eq("active", true),
    db.from("rate_groups").select("name").eq("tenant_id", tenantId),
  ]);
  const settings = ((tenant as { settings?: Record<string, unknown> } | null)?.settings ??
    {}) as Record<string, unknown>;
  const tz = String(settings.timezone ?? "Europe/Madrid");
  const props = (properties ?? []) as { name: string; city: string }[];
  const types = (groups ?? []) as { name: string }[];
  return systemPrompt({
    name: String((tenant as { name?: string } | null)?.name ?? "el hotel"),
    today: ymdInZone(now, tz),
    weekday: new Intl.DateTimeFormat("es-ES", { weekday: "long", timeZone: tz }).format(now),
    checkinHour: Number(settings.checkin_hour ?? 15),
    checkoutHour: Number(settings.checkout_hour ?? 12),
    paymentOptions: hotelPolicies(settings).paymentModes.map((m) => PAYMENT_MODE_LABELS[m]),
    cancellationPolicy: cancellationSummary(hotelPolicies(settings)),
    about: [
      props.length ? `Hoteles: ${props.map((p) => `${p.name} (${p.city})`).join(", ")}.` : "",
      types.length ? `Tipos de habitación: ${types.map((g) => g.name).join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    suffix,
  });
}
