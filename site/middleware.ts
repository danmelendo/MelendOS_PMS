// Vercel Routing Middleware: the management panel (/admin/ and everything
// under it) only opens from the IPs in the allowlist of the sales project
// (sales_allowed_ips, managed from the panel). The database checks the IP of
// every data request too (is_sales_admin), so this layer only keeps the page
// itself away from everyone else. An empty list means no restriction yet.
// /admin/__ip answers the IP Vercel sees, for the panel's "Añadir mi IP".
import { ipAddress } from "@vercel/functions";
import { next } from "@vercel/functions/middleware";

export const config = { matcher: ["/admin", "/admin/:path*"] };

const url = process.env.VITE_SALES_SUPABASE_URL;
const key = process.env.VITE_SALES_SUPABASE_KEY;

async function allowed(ip: string): Promise<boolean> {
  // Without the project's variables this layer cannot ask; the data is still
  // guarded by the database, so the page opens instead of breaking the panel.
  if (!url || !key) {
    console.warn("admin middleware: VITE_SALES_SUPABASE_URL/KEY missing, IP not checked");
    return true;
  }
  try {
    const res = await fetch(`${url}/rest/v1/rpc/admin_ip_allowed`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_ip: ip }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok && (await res.json()) === true;
  } catch {
    // Fail closed: without an answer the panel stays shut.
    return false;
  }
}

const blocked = (ip: string) =>
  new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Acceso no permitido · Melend/OS</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#0f1b33">
<h1 style="font-size:1.25rem">Acceso no permitido desde esta red</h1>
<p>El panel de gestión solo se abre desde las direcciones autorizadas.</p>
<p style="color:#5b6477;font-size:.9rem">Tu IP: <code>${ip.replace(/[^0-9a-fA-F:.]/g, "")}</code></p>
</body></html>`,
    {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    },
  );

export default async function middleware(request: Request) {
  const ip = ipAddress(request) ?? "";
  if (new URL(request.url).pathname.replace(/\/+$/, "") === "/admin/__ip") {
    return Response.json({ ip }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!ip || !(await allowed(ip))) return blocked(ip || "desconocida");
  return next({ headers: { "Cache-Control": "no-store" } });
}
