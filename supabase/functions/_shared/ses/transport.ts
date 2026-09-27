// How requests reach the ministry. Which transport a hotel uses is
// configuration (ses_settings.environment), never code:
// - "prod" / "pre": the real service (production, or the ministry's test
//   environment), HTTP Basic with the hotel's credentials from Vault.
// - "simulated": answers like the service without leaving the server, for the
//   demo and for hotels still waiting for their ministry credentials. The
//   request files are built and zipped exactly as for the real service.
import { packRequest } from "./zip.ts";
import {
  parseResponse,
  SES_ENDPOINTS,
  soapEnvelope,
  type SesKind,
  type SesOperation,
  type SesResponse,
} from "./xml.ts";

export type SesEnvironment = "simulated" | "pre" | "prod";

export interface SesConfig {
  environment: SesEnvironment;
  landlordCode: string;
  appName: string;
  credentials?: { user: string; password: string; ca_cert?: string } | null;
}

export interface SesTransport {
  /** One call to the "comunicacion" operation with a request file. */
  call(operation: SesOperation, kind: SesKind | undefined, xml: string): Promise<SesResponse>;
}

export function transportFor(config: SesConfig): SesTransport {
  return config.environment === "simulated" ? simulatedTransport() : soapTransport(config);
}

type DenoHttp = {
  createHttpClient?: (o: { caCerts: string[] }) => unknown;
};

export function soapTransport(config: SesConfig): SesTransport {
  const endpoint = SES_ENDPOINTS[config.environment as "pre" | "prod"];
  const creds = config.credentials;
  return {
    async call(operation, kind, xml) {
      if (!creds?.user || !creds.password)
        throw new Error("Faltan las credenciales del ministerio");
      const body = soapEnvelope({
        arrendador: config.landlordCode,
        aplicacion: config.appName,
        operacion: operation,
        tipo: kind,
        solicitud: await packRequest(xml),
      });
      // The service may need its certificate chain trusted explicitly.
      const deno = (globalThis as { Deno?: DenoHttp }).Deno;
      const client =
        creds.ca_cert && deno?.createHttpClient
          ? deno.createHttpClient({ caCerts: [creds.ca_cert] })
          : undefined;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: '""',
          Authorization: "Basic " + btoa(`${creds.user}:${creds.password}`),
        },
        body,
        ...(client ? { client } : {}),
        signal: AbortSignal.timeout(30_000),
      } as RequestInit);
      const text = await res.text();
      if (!text.includes("respuesta") && !text.includes("Fault"))
        throw new Error(`El ministerio respondió ${res.status}`);
      return parseResponse(text);
    },
  };
}

// ── Simulated service ───────────────────────────────────────────────────────
// Stateless: the batch id it returns carries the operation and the number of
// communications, so a later query can answer without memory. Communication
// codes are derived from the batch id, so every query gives the same ones.

async function codeFor(batch: string, order: number): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${batch}#${order}`)),
  );
  const h = [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const count = (xml: string, tag: string) =>
  (xml.match(new RegExp(`<(?:\\w+:)?${tag}>`, "g")) ?? []).length;

export function simulatedTransport(): SesTransport {
  return {
    async call(operation, _kind, xml) {
      if (operation === "A" || operation === "B") {
        const n = operation === "A" ? count(xml, "comunicacion") : count(xml, "codigoComunicacion");
        if (!n)
          return {
            codigo: 10110,
            descripcion: "No ha informado la solicitud",
            lote: null,
            resultados: [],
          };
        const lote =
          operation.toLowerCase() + n.toString(16).padStart(7, "0") + crypto.randomUUID().slice(8);
        return { codigo: 0, descripcion: "Ok", lote, resultados: [] };
      }
      const lotes = [...xml.matchAll(/<(?:\w+:)?lote>([^<]+)</g)].map((m) => m[1]);
      if (lotes.length > 10)
        return {
          codigo: 10136,
          descripcion: "Se ha superado el número máximo de comunicaciones a consultar",
          lote: null,
          resultados: [],
        };
      const resultados = await Promise.all(
        lotes.map(async (lote) => {
          const op = lote[0] === "b" ? "B" : "A";
          const n = parseInt(lote.slice(1, 8), 16) || 0;
          return {
            lote,
            tipoOperacion: op,
            codigoEstado: 1,
            descEstado: "Lote tramitado sin errores (simulado)",
            comunicaciones:
              op === "A"
                ? await Promise.all(
                    Array.from({ length: n }, async (_, i) => ({
                      orden: i + 1,
                      codigo: await codeFor(lote, i + 1),
                      anulada: false,
                      tipoError: null,
                      error: null,
                    })),
                  )
                : [],
          };
        }),
      );
      return { codigo: 0, descripcion: "Ok", lote: null, resultados };
    },
  };
}
