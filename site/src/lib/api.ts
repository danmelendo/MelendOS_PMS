import { SALES } from "../config";

export class LeadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Calls the leads function of the sales project. */
async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!SALES.url || !SALES.key) throw new LeadError("El formulario no está configurado.", 503);
  let res: Response;
  try {
    res = await fetch(`${SALES.url}/functions/v1/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SALES.key,
        Authorization: `Bearer ${SALES.key}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LeadError("Sin conexión. Inténtalo de nuevo en un momento.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new LeadError(data.error ?? "No se pudo enviar.", res.status);
  return data as T;
}

export const fetchSlots = () => call<{ slots: string[] }>({ action: "slots" }).then((r) => r.slots);

export interface LeadInput {
  kind: "demo" | "contact";
  slot?: string;
  name: string;
  email: string;
  company: string;
  phone?: string;
  hotels?: number;
  rooms?: number;
  plan?: string;
  message?: string;
  privacy_ok: boolean;
  marketing_ok: boolean;
  website?: string;
}

export const submitLead = (lead: LeadInput) =>
  call<{ id: string; slot: string | null }>({
    action: "submit",
    ...lead,
    ...attribution(),
    page: location.pathname,
  });

// Campaign attribution: kept from the first page the visitor lands on, so a
// lead from an ad is credited to it even after browsing to the demo page.
const KEY = "ds-attribution";
const UTM = ["utm_source", "utm_medium", "utm_campaign"] as const;

export function rememberAttribution() {
  try {
    if (sessionStorage.getItem(KEY)) return;
    const q = new URLSearchParams(location.search);
    const data: Record<string, string> = {};
    for (const k of UTM) if (q.get(k)) data[k] = q.get(k)!;
    if (document.referrer && !document.referrer.startsWith(location.origin))
      data.referrer = document.referrer;
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage blocked: attribution is best effort.
  }
}

function attribution(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}
