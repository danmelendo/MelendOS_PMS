import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import type { SesTraveller } from "../domain/ses.ts";
import {
  buildCommunication,
  dispatchTenant,
  type SesBookingData,
  type SesPatch,
  type SesRow,
  type SesStore,
} from "./dispatch.ts";
import { simulatedTransport, type SesTransport } from "./transport.ts";
import {
  buildAltaXml,
  buildCancelXml,
  buildQueryXml,
  localDateTime,
  parseResponse,
  soapEnvelope,
} from "./xml.ts";
import { packRequest, zipSingle } from "./zip.ts";

const guest: SesTraveller = {
  is_holder: true,
  first_name: "Laura",
  last_name1: "Gómez",
  last_name2: "Ruiz",
  document_type: "NIF",
  document_number: "12345678Z",
  document_support: "ABC123456",
  birth_date: "1990-05-01",
  nationality: "ESP",
  sex: "M",
  address: "Calle Mayor 1 & 2",
  municipality_code: "46250",
  postal_code: "46001",
  country: "ESP",
  email: "laura@example.com",
};
const booking: SesBookingData = {
  reference: "AB12CD34",
  created_at: "2026-09-20T10:00:00Z",
  start_at: "2026-10-01T13:00:00Z", // 15:00 in Madrid
  end_at: "2026-10-03T10:00:00Z",
  people: 1,
  payment_mode: "at_hotel",
  channel_id: null,
  timezone: "Europe/Madrid",
  establishment_code: "0000000042",
  customer: { name: "Laura Gómez Ruiz", phone: null, email: "laura@example.com" },
  travellers: [guest],
};

describe("xml", () => {
  it("writes a traveller report in the order of the ministry's schema", () => {
    const built = buildCommunication("PV", booking);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const xml = buildAltaXml("PV", [built.comm]);
    expect(xml).toContain(
      '<alt:peticion xmlns:alt="http://www.neg.hospedajes.mir.es/altaParteHospedaje">',
    );
    expect(xml).toContain(
      "<solicitud><codigoEstablecimiento>0000000042</codigoEstablecimiento><comunicacion><contrato>",
    );
    expect(xml).toContain(
      "<fechaEntrada>2026-10-01T15:00:00</fechaEntrada><fechaSalida>2026-10-03T12:00:00</fechaSalida>",
    );
    expect(xml).toContain("<pago><tipoPago>DESTI</tipoPago></pago>");
    const order = [
      "rol",
      "nombre",
      "apellido1",
      "apellido2",
      "tipoDocumento",
      "numeroDocumento",
      "soporteDocumento",
      "fechaNacimiento",
      "nacionalidad",
      "sexo",
      "direccion",
      "correo",
    ];
    const at = order.map((t) => xml.indexOf(`<${t}>`));
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(xml).toContain(
      "<direccion><direccion>Calle Mayor 1 &amp; 2</direccion><codigoMunicipio>46250</codigoMunicipio><codigoPostal>46001</codigoPostal><pais>ESP</pais></direccion>",
    );
    expect(xml).not.toContain("nombreMunicipio");
  });

  it("writes a booking with the establishment in each communication and the holder", () => {
    const built = buildCommunication("RH", { ...booking, travellers: [] });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const xml = buildAltaXml("RH", [built.comm]);
    expect(xml).toContain('xmlns:alt="http://www.neg.hospedajes.mir.es/altaReservaHospedaje"');
    expect(xml).toContain(
      "<comunicacion><establecimiento><codigo>0000000042</codigo></establecimiento><contrato>",
    );
    expect(xml).toContain(
      "<persona><rol>TI</rol><nombre>Laura</nombre><apellido1>Gómez</apellido1><apellido2>Ruiz</apellido2><correo>laura@example.com</correo></persona>",
    );
  });

  it("blocks a report with missing data and says what is missing", () => {
    const built = buildCommunication("PV", {
      ...booking,
      people: 2,
      establishment_code: null,
      travellers: [{ ...guest, document_support: null }],
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.reasons).toEqual([
      "Falta el código de establecimiento del ministerio",
      "Viajero 1: Falta el número de soporte",
      "Faltan 1 de 2 viajeros por registrar",
    ]);
  });

  it("writes queries, cancellations and the SOAP envelope like the specification's annexes", () => {
    expect(buildQueryXml(["L1"])).toContain(
      '<con:lotes xmlns:con="http://www.neg.hospedajes.mir.es/consultarComunicacion"><con:lote>L1</con:lote></con:lotes>',
    );
    expect(buildCancelXml(["C1", "C2"])).toContain(
      "<anul:codigoComunicacion>C1</anul:codigoComunicacion><anul:codigoComunicacion>C2</anul:codigoComunicacion>",
    );
    const env = soapEnvelope({
      arrendador: "0000000001",
      aplicacion: "PMS",
      operacion: "A",
      tipo: "PV",
      solicitud: "UEs=",
    });
    expect(env).toContain(
      "<cabecera><codigoArrendador>0000000001</codigoArrendador><aplicacion>PMS</aplicacion><tipoOperacion>A</tipoOperacion><tipoComunicacion>PV</tipoComunicacion></cabecera><solicitud>UEs=</solicitud>",
    );
    expect(
      soapEnvelope({
        arrendador: "1",
        aplicacion: "PMS",
        operacion: "C",
        tipo: "PV",
        solicitud: "x",
      }),
    ).not.toContain("tipoComunicacion");
  });

  it("reads the answers of the specification's annexes", () => {
    const ok = parseResponse(
      `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Header/><SOAP-ENV:Body><ns3:comunicacionResponse xmlns:ns3="x"><respuesta><codigoRetorno>0</codigoRetorno><descripcion>Ok</descripcion><lote>00000000-0000-0000-0000-000000000000</lote></respuesta></ns3:comunicacionResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>`,
    );
    expect(ok).toEqual({
      codigo: 0,
      descripcion: "Ok",
      lote: "00000000-0000-0000-0000-000000000000",
      resultados: [],
    });

    const query = parseResponse(
      `<ns3:comunicacionResponse xmlns:ns3="x"><respuesta><codigo>0</codigo><descripcion>Ok</descripcion></respuesta><resultado><lote>L1</lote><tipoComuniacion>PV</tipoComuniacion><tipoOperacion>A</tipoOperacion><codigoEstado>6</codigoEstado><descEstado>Se ha ejecutado pero hay errores en algunas comunicaciones</descEstado><resultadoComunicaciones><resutadoComunicacion><orden>1</orden><tipoError>Error validación de datos</tipoError><error>No existe un establecimiento para ese código &lt;1234567890&gt;</error></resutadoComunicacion><resultadoComunicacion><orden>2</orden><codigoComunicacion>44444444-4444-4444-4444-444444444441</codigoComunicacion></resultadoComunicacion></resultadoComunicaciones></resultado></ns3:comunicacionResponse>`,
    );
    expect(query.codigo).toBe(0);
    expect(query.resultados).toHaveLength(1);
    expect(query.resultados[0].codigoEstado).toBe(6);
    expect(query.resultados[0].comunicaciones).toEqual([
      {
        orden: 1,
        codigo: null,
        anulada: false,
        tipoError: "Error validación de datos",
        error: "No existe un establecimiento para ese código <1234567890>",
      },
      {
        orden: 2,
        codigo: "44444444-4444-4444-4444-444444444441",
        anulada: false,
        tipoError: null,
        error: null,
      },
    ]);

    expect(
      parseResponse("<soap:Fault><faultstring>Unauthorized</faultstring></soap:Fault>").codigo,
    ).toBe(-1);
  });

  it("formats dates in the hotel's time", () => {
    expect(localDateTime("2026-01-15T14:00:00Z", "Europe/Madrid")).toBe("2026-01-15T15:00:00");
    expect(localDateTime("2026-07-15T14:00:00Z", "Atlantic/Canary")).toBe("2026-07-15T15:00:00");
  });
});

describe("zip", () => {
  it("packs one deflated entry that a standard unzip reads back", async () => {
    const xml = buildQueryXml(["Ñandú-1", "á".repeat(500)]);
    const zip = Buffer.from(await zipSingle("solicitud.xml", xml));
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const packedSize = zip.readUInt32LE(18);
    const nameLen = zip.readUInt16LE(26);
    expect(zip.subarray(30, 30 + nameLen).toString()).toBe("solicitud.xml");
    const data = zip.subarray(30 + nameLen, 30 + nameLen + packedSize);
    expect(inflateRawSync(data).toString("utf8")).toBe(xml);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    const b64 = await packRequest(xml);
    expect(Buffer.from(b64, "base64").equals(zip)).toBe(true);
  });
});

// ── Dispatcher ──────────────────────────────────────────────────────────────

function fakeStore(rows: SesRow[], data: Record<string, SesBookingData>) {
  const store: SesStore & { rows: SesRow[] } = {
    rows,
    async awaiting() {
      return rows.filter((r) => r.status === "sent");
    },
    async due() {
      return rows
        .filter(
          (r) =>
            ["pending", "blocked"].includes(r.status) || (r.status === "error" && r.attempts < 5),
        )
        .map((r) => {
          const t = rows.find((x) => x.id === r.target_id);
          return { ...r, target_code: t?.ses_code ?? null, target_status: t?.status ?? null };
        });
    },
    async bookingData(id) {
      return data[id] ?? null;
    },
    async update(ids, patch: SesPatch) {
      for (const r of rows) if (ids.includes(r.id)) Object.assign(r, patch);
    },
  };
  return store;
}
const row = (id: string, over: Partial<SesRow> = {}): SesRow => ({
  id,
  tenant_id: "t1",
  reservation_id: "r1",
  kind: "RH",
  operation: "A",
  status: "pending",
  batch: null,
  batch_order: null,
  ses_code: null,
  attempts: 0,
  target_id: null,
  ...over,
});

describe("dispatchTenant", () => {
  it("sends, then collects the codes on the next run", async () => {
    const store = fakeStore(
      [row("rh"), row("pv", { kind: "PV" }), row("bad", { kind: "PV", reservation_id: "r2" })],
      { r1: booking, r2: { ...booking, travellers: [] } },
    );
    const t = simulatedTransport();
    const first = await dispatchTenant(store, t, "t1");
    expect(first).toMatchObject({ sent: 2, blocked: 1, accepted: 0 });
    expect(store.rows.find((r) => r.id === "bad")).toMatchObject({
      status: "blocked",
      error: "Faltan 1 de 1 viajeros por registrar",
    });

    const second = await dispatchTenant(store, t, "t1");
    expect(second).toMatchObject({ accepted: 2, blocked: 1 });
    const rh = store.rows.find((r) => r.id === "rh")!;
    expect(rh.status).toBe("accepted");
    expect(rh.ses_code).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("cancels a reported booking once it has its code, and skips cancelling what never arrived", async () => {
    const store = fakeStore(
      [
        row("rh", { status: "accepted", ses_code: "code-1" }),
        row("b", { operation: "B", target_id: "rh" }),
        row("gone", { status: "rejected" }),
        row("b2", { operation: "B", target_id: "gone" }),
      ],
      { r1: booking },
    );
    const t = simulatedTransport();
    await dispatchTenant(store, t, "t1");
    expect(store.rows.find((r) => r.id === "b2")!.status).toBe("skipped");
    expect(store.rows.find((r) => r.id === "b")!.status).toBe("sent");
    await dispatchTenant(store, t, "t1");
    expect(store.rows.find((r) => r.id === "b")!.status).toBe("accepted");
    expect(store.rows.find((r) => r.id === "rh")!.status).toBe("cancelled");
  });

  it("records the ministry's refusals per communication and service errors for a retry", async () => {
    const store = fakeStore([row("a"), row("b", { reservation_id: "r1" })], { r1: booking });
    const t: SesTransport = {
      async call(op) {
        if (op === "A") return { codigo: 0, descripcion: "Ok", lote: "L1", resultados: [] };
        return {
          codigo: 0,
          descripcion: "Ok",
          lote: null,
          resultados: [
            {
              lote: "L1",
              tipoOperacion: "A",
              codigoEstado: 6,
              descEstado: "con errores",
              comunicaciones: [
                { orden: 1, codigo: "c-1", anulada: false, tipoError: null, error: null },
                {
                  orden: 2,
                  codigo: null,
                  anulada: false,
                  tipoError: "10121",
                  error: "Error de validación",
                },
              ],
            },
          ],
        };
      },
    };
    await dispatchTenant(store, t, "t1");
    await dispatchTenant(store, t, "t1");
    expect(
      store.rows.map((r) => [r.status, r.ses_code, (r as SesRow & { error?: string }).error]),
    ).toEqual([
      ["accepted", "c-1", null],
      ["rejected", null, "10121: Error de validación"],
    ]);

    const down = fakeStore([row("x")], { r1: booking });
    await dispatchTenant(down, { call: () => Promise.reject(new Error("timeout")) }, "t1");
    expect(down.rows[0]).toMatchObject({ status: "error", attempts: 1, error: "timeout" });
  });
});
