// Copied from the product (supabase/functions/_shared/verifactu/). Keep in step:
// a fix there goes here too (see site/README.md, VERI*FACTU).
// How billing records reach the AEAT. Which transport a hotel uses is
// configuration (fiscal_settings.environment, kept in each record), never code:
// - "prod" / "pre": the AEAT's VERI*FACTU service (production or its external
//   test portal), authenticated with the hotel's qualified certificate
//   (mutual TLS; PEM certificate and key from Vault).
// - "simulated": answers like the AEAT without leaving the server (demo). It
//   checks what it can check offline: the fingerprint of every record and the
//   recipient's NIF; the rest is accepted.
import { validSpanishTaxId } from "./domain.ts";
import { huella } from "./hash.ts";
import { blocks, parseResponse, text, VERIFACTU_ENDPOINTS, type VerifactuResponse } from "./xml.ts";

export type Environment = "simulated" | "pre" | "prod";

export interface VerifactuTransport {
  send(xml: string): Promise<VerifactuResponse>;
}

export function transportFor(
  environment: Environment,
  certificate?: { cert: string; key: string } | null,
): VerifactuTransport {
  return environment === "simulated"
    ? simulatedTransport()
    : aeatTransport(environment, certificate);
}

type DenoHttp = { createHttpClient?: (o: { cert: string; key: string }) => unknown };

export function aeatTransport(
  environment: "pre" | "prod",
  certificate?: { cert: string; key: string } | null,
): VerifactuTransport {
  return {
    async send(xml) {
      if (!certificate?.cert || !certificate.key)
        throw new Error("Falta el certificado electrónico del hotel");
      const deno = (globalThis as { Deno?: DenoHttp }).Deno;
      if (!deno?.createHttpClient) throw new Error("Este entorno no admite certificado de cliente");
      const client = deno.createHttpClient({ cert: certificate.cert, key: certificate.key });
      const res = await fetch(VERIFACTU_ENDPOINTS[environment], {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
        body: xml,
        client,
        signal: AbortSignal.timeout(60_000),
      } as RequestInit);
      const body = await res.text();
      if (!body.includes("Envelope")) throw new Error(`La AEAT respondió ${res.status}`);
      return parseResponse(body);
    },
  };
}

// ── Simulated AEAT ──────────────────────────────────────────────────────────

const csv = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32])
    .join("");

export function simulatedTransport(): VerifactuTransport {
  return {
    async send(xml) {
      const lines = await Promise.all(
        blocks(xml, "RegistroFactura").map(async (r) => {
          const alta = blocks(r, "RegistroAlta")[0];
          const rec = alta ?? blocks(r, "RegistroAnulacion")[0] ?? "";
          const prev = blocks(rec, "RegistroAnterior")[0];
          const g = (n: string) => text(rec, n) ?? "";
          const expected = alta
            ? await huella({
                IDEmisorFactura: g("IDEmisorFactura"),
                NumSerieFactura: g("NumSerieFactura"),
                FechaExpedicionFactura: g("FechaExpedicionFactura"),
                TipoFactura: g("TipoFactura"),
                CuotaTotal: g("CuotaTotal"),
                ImporteTotal: g("ImporteTotal"),
                Huella: prev ? (text(prev, "Huella") ?? "") : "",
                FechaHoraHusoGenRegistro: g("FechaHoraHusoGenRegistro"),
              })
            : await huella({
                IDEmisorFacturaAnulada: g("IDEmisorFacturaAnulada"),
                NumSerieFacturaAnulada: g("NumSerieFacturaAnulada"),
                FechaExpedicionFacturaAnulada: g("FechaExpedicionFacturaAnulada"),
                Huella: prev ? (text(prev, "Huella") ?? "") : "",
                FechaHoraHusoGenRegistro: g("FechaHoraHusoGenRegistro"),
              });
          // The record's own Huella is the last one (the previous one is inside RegistroAnterior).
          const own = [...rec.matchAll(/<(?:[\w-]+:)?Huella>([^<]*)</g)].map((m) => m[1]).at(-1);
          const dest = blocks(rec, "IDDestinatario")[0];
          const destNif = dest ? text(dest, "NIF") : null;
          const base = {
            ref: text(rec, "RefExterna"),
            number: alta ? g("NumSerieFactura") : g("NumSerieFacturaAnulada"),
            operation: alta ? "Alta" : "Anulacion",
            duplicateState: null,
          };
          if (destNif && !validSpanishTaxId(destNif))
            return {
              ...base,
              state: "Incorrecto" as const,
              code: "SIM01",
              description: "(Simulado) El NIF del destinatario no es válido",
            };
          if (own !== expected)
            return {
              ...base,
              state: "AceptadoConErrores" as const,
              code: "SIM02",
              description: "(Simulado) La huella no coincide con la calculada",
            };
          return { ...base, state: "Correcto" as const, code: null, description: null };
        }),
      );
      const ok = lines.filter((l) => l.state !== "Incorrecto").length;
      return {
        fault: null,
        csv: ok ? csv() : null,
        wait: 60,
        state:
          ok === lines.length && lines.every((l) => l.state === "Correcto")
            ? "Correcto"
            : ok
              ? "ParcialmenteCorrecto"
              : "Incorrecto",
        lines,
      };
    },
  };
}
