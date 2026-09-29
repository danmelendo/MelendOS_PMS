// Copied from the product (supabase/functions/_shared/verifactu/verifactu.test.ts),
// without its hotel invoicing rules, plus the tax id checks copied in domain.ts.
import { describe, expect, it } from "vitest";
import { aeatAmount, aeatDate, qrUrl, validCif, validSpanishTaxId } from "./domain.ts";
import {
  dispatchTenant,
  type RecordPatch,
  type VerifactuStore,
  type VfInvoice,
  type VfRecord,
} from "./dispatch.ts";
import { hashInput, huella } from "./hash.ts";
import { simulatedTransport, type VerifactuTransport } from "./transport.ts";
import { buildRequest, parseResponse, type RecordXml } from "./xml.ts";

// The AEAT's examples ("especificaciones de la huella" v0.1.2, 6.1 to 6.3).
const CASE1 = {
  IDEmisorFactura: "89890001K",
  NumSerieFactura: "12345678/G33",
  FechaExpedicionFactura: "01-01-2024",
  TipoFactura: "F1",
  CuotaTotal: "12.35",
  ImporteTotal: "123.45",
  Huella: "",
  FechaHoraHusoGenRegistro: "2024-01-01T19:20:30+01:00",
};

describe("fingerprint", () => {
  it("matches the AEAT's three examples", async () => {
    expect(hashInput(CASE1)).toBe(
      "IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00",
    );
    expect(await huella(CASE1)).toBe(
      "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60",
    );
    expect(
      await huella({
        ...CASE1,
        NumSerieFactura: "12345679/G34",
        Huella: "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60",
        FechaHoraHusoGenRegistro: "2024-01-01T19:20:35+01:00",
      }),
    ).toBe("F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97");
    expect(
      await huella({
        IDEmisorFacturaAnulada: "89890001K",
        NumSerieFacturaAnulada: "12345679/G34",
        FechaExpedicionFacturaAnulada: "01-01-2024",
        Huella: "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97",
        FechaHoraHusoGenRegistro: "2024-01-01T19:20:40+01:00",
      }),
    ).toBe("177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68");
  });
});

const SIF = {
  producerName: "Melend/OS (pruebas)",
  producerNif: "B00000000",
  name: "Melend/OS",
  id: "MO",
  version: "1.0.0",
  installation: "20260927120000-abcdef12",
};

async function altaRecord(over: Partial<RecordXml> = {}): Promise<RecordXml> {
  const r: RecordXml = {
    id: "rec-1",
    kind: "alta",
    subsanacion: false,
    rechazo_previo: null,
    sin_registro_previo: false,
    issuer: { nif: "B12345674", name: "Hotel Lumen S.L." },
    invoice: { nif: "B12345674", number: "F2026-000001", date: "27-09-2026" },
    type: "F1",
    description: "Estancia AB12CD34",
    recipient: { name: "John Doe & Co", country: "GB", id_type: "02", id_number: "GB123456789" },
    breakdown: [{ rate: 10, base: "233.91", tax: "23.39" }],
    cuota_total: "23.39",
    importe_total: "257.30",
    previous: null,
    generated_at: "2026-09-27T19:20:30+02:00",
    hash: "",
    ...over,
  };
  r.hash = await huella({
    IDEmisorFactura: r.invoice.nif,
    NumSerieFactura: r.invoice.number,
    FechaExpedicionFactura: r.invoice.date,
    TipoFactura: r.type!,
    CuotaTotal: r.cuota_total!,
    ImporteTotal: r.importe_total!,
    Huella: r.previous?.hash ?? "",
    FechaHoraHusoGenRegistro: r.generated_at,
  });
  return r;
}

describe("xml", () => {
  it("writes the request in the order of the AEAT's schema", async () => {
    const xml = buildRequest(
      { nif: "B12345674", name: "Hotel Lumen S.L." },
      [await altaRecord()],
      SIF,
    );
    expect(xml).toContain(
      "<sum:Cabecera><sf:ObligadoEmision><sf:NombreRazon>Hotel Lumen S.L.</sf:NombreRazon><sf:NIF>B12345674</sf:NIF></sf:ObligadoEmision></sum:Cabecera>",
    );
    const order = [
      "IDVersion",
      "IDFactura",
      "RefExterna",
      "NombreRazonEmisor",
      "TipoFactura",
      "DescripcionOperacion",
      "Destinatarios",
      "Desglose",
      "CuotaTotal",
      "ImporteTotal",
      "Encadenamiento",
      "SistemaInformatico",
      "FechaHoraHusoGenRegistro",
      "TipoHuella",
    ];
    const at = order.map((t) => xml.indexOf(`<sf:${t}>`));
    expect(at.every((x) => x > 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(xml).toContain(
      "<sf:Encadenamiento><sf:PrimerRegistro>S</sf:PrimerRegistro></sf:Encadenamiento>",
    );
    expect(xml).toContain(
      "<sf:IDDestinatario><sf:NombreRazon>John Doe &amp; Co</sf:NombreRazon><sf:IDOtro><sf:CodigoPais>GB</sf:CodigoPais><sf:IDType>02</sf:IDType><sf:ID>GB123456789</sf:ID></sf:IDOtro></sf:IDDestinatario>",
    );
    expect(xml).toContain(
      "<sf:DetalleDesglose><sf:Impuesto>01</sf:Impuesto><sf:ClaveRegimen>01</sf:ClaveRegimen><sf:CalificacionOperacion>S1</sf:CalificacionOperacion><sf:TipoImpositivo>10</sf:TipoImpositivo><sf:BaseImponibleOimporteNoSujeto>233.91</sf:BaseImponibleOimporteNoSujeto><sf:CuotaRepercutida>23.39</sf:CuotaRepercutida></sf:DetalleDesglose>",
    );
    expect(xml).toContain("<sf:TipoUsoPosibleSoloVerifactu>S</sf:TipoUsoPosibleSoloVerifactu>");
  });

  it("writes rectifications, replacements, resubmissions and cancellations", async () => {
    const prev = {
      nif: "B12345674",
      number: "F2026-000001",
      date: "27-09-2026",
      hash: "A".repeat(64),
    };
    const r1 = await altaRecord({
      id: "rec-2",
      type: "R1",
      invoice: { nif: "B12345674", number: "R2026-000001", date: "27-09-2026" },
      rectified: [{ nif: "B12345674", number: "F2026-000001", date: "27-09-2026" }],
      previous: prev,
      subsanacion: true,
      rechazo_previo: "X",
    });
    const cancel: RecordXml = {
      id: "rec-3",
      kind: "anulacion",
      subsanacion: false,
      rechazo_previo: null,
      sin_registro_previo: true,
      issuer: r1.issuer,
      invoice: r1.invoice,
      previous: { ...r1.invoice, hash: r1.hash },
      generated_at: "2026-09-27T19:21:00+02:00",
      hash: "B".repeat(64),
    };
    const xml = buildRequest(r1.issuer, [r1, cancel], SIF);
    expect(xml).toContain(
      "<sf:Subsanacion>S</sf:Subsanacion><sf:RechazoPrevio>X</sf:RechazoPrevio><sf:TipoFactura>R1</sf:TipoFactura><sf:TipoRectificativa>I</sf:TipoRectificativa><sf:FacturasRectificadas><sf:IDFacturaRectificada><sf:IDEmisorFactura>B12345674</sf:IDEmisorFactura><sf:NumSerieFactura>F2026-000001</sf:NumSerieFactura>",
    );
    expect(xml).toContain(
      `<sf:RegistroAnterior><sf:IDEmisorFactura>B12345674</sf:IDEmisorFactura><sf:NumSerieFactura>F2026-000001</sf:NumSerieFactura><sf:FechaExpedicionFactura>27-09-2026</sf:FechaExpedicionFactura><sf:Huella>${"A".repeat(64)}</sf:Huella></sf:RegistroAnterior>`,
    );
    expect(xml).toContain(
      "<sf:RegistroAnulacion><sf:IDVersion>1.0</sf:IDVersion><sf:IDFactura><sf:IDEmisorFacturaAnulada>B12345674</sf:IDEmisorFacturaAnulada><sf:NumSerieFacturaAnulada>R2026-000001</sf:NumSerieFacturaAnulada><sf:FechaExpedicionFacturaAnulada>27-09-2026</sf:FechaExpedicionFacturaAnulada></sf:IDFactura><sf:RefExterna>rec-3</sf:RefExterna><sf:SinRegistroPrevio>S</sf:SinRegistroPrevio>",
    );
  });

  it("reads the AEAT's answers and faults", () => {
    const res =
      parseResponse(`<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body>
      <tikR:RespuestaRegFactuSistemaFacturacion xmlns:tikR="r" xmlns:tik="i">
        <tikR:CSV>A-BCDEFGH12345678</tikR:CSV><tikR:TiempoEsperaEnvio>60</tikR:TiempoEsperaEnvio>
        <tikR:EstadoEnvio>ParcialmenteCorrecto</tikR:EstadoEnvio>
        <tikR:RespuestaLinea><tikR:IDFactura><tik:IDEmisorFactura>B12345674</tik:IDEmisorFactura><tik:NumSerieFactura>F2026-000001</tik:NumSerieFactura><tik:FechaExpedicionFactura>27-09-2026</tik:FechaExpedicionFactura></tikR:IDFactura>
          <tikR:Operacion><tik:TipoOperacion>Alta</tik:TipoOperacion></tikR:Operacion><tikR:RefExterna>rec-1</tikR:RefExterna><tikR:EstadoRegistro>Correcto</tikR:EstadoRegistro></tikR:RespuestaLinea>
        <tikR:RespuestaLinea><tikR:IDFactura><tik:NumSerieFactura>F2026-000002</tik:NumSerieFactura></tikR:IDFactura><tikR:Operacion><tik:TipoOperacion>Alta</tik:TipoOperacion></tikR:Operacion>
          <tikR:RefExterna>rec-2</tikR:RefExterna><tikR:EstadoRegistro>Incorrecto</tikR:EstadoRegistro><tikR:CodigoErrorRegistro>3000</tikR:CodigoErrorRegistro><tikR:DescripcionErrorRegistro>Registro duplicado</tikR:DescripcionErrorRegistro>
          <tikR:RegistroDuplicado><tik:EstadoRegistroDuplicado>Correcta</tik:EstadoRegistroDuplicado></tikR:RegistroDuplicado></tikR:RespuestaLinea>
      </tikR:RespuestaRegFactuSistemaFacturacion></env:Body></env:Envelope>`);
    expect(res).toMatchObject({
      fault: null,
      csv: "A-BCDEFGH12345678",
      wait: 60,
      state: "ParcialmenteCorrecto",
    });
    expect(res.lines).toEqual([
      {
        ref: "rec-1",
        number: "F2026-000001",
        operation: "Alta",
        state: "Correcto",
        code: null,
        description: null,
        duplicateState: null,
      },
      {
        ref: "rec-2",
        number: "F2026-000002",
        operation: "Alta",
        state: "Incorrecto",
        code: "3000",
        description: "Registro duplicado",
        duplicateState: "Correcta",
      },
    ]);
    expect(
      parseResponse(
        "<env:Envelope><env:Body><env:Fault><faultcode>env:Client</faultcode><faultstring>Codigo[4104].El NIF del titular en la cabecera no está identificado.</faultstring></env:Fault></env:Body></env:Envelope>",
      ).fault,
    ).toMatch(/4104/);
  });

  it("the simulated AEAT checks fingerprints and recipients", async () => {
    const good = await altaRecord({ recipient: { name: "Viajes Prueba S.A.", nif: "A12345674" } });
    const tampered = { ...(await altaRecord({ id: "rec-t" })), hash: "0".repeat(64) };
    const badNif = await altaRecord({ id: "rec-n", recipient: { name: "X", nif: "A12345675" } });
    const res = await simulatedTransport().send(
      buildRequest(good.issuer, [good, tampered, badNif], SIF),
    );
    expect(res.lines.map((l) => [l.ref, l.state])).toEqual([
      ["rec-1", "Correcto"],
      ["rec-t", "AceptadoConErrores"],
      ["rec-n", "Incorrecto"],
    ]);
    expect(res.state).toBe("ParcialmenteCorrecto");
    expect(res.csv).toHaveLength(16);
  });
});

// ── Dispatcher ──────────────────────────────────────────────────────────────

const INVOICE: VfInvoice = {
  id: "inv-1",
  type: "F2",
  number: "PS2026-000001",
  issue_date: "2026-09-27",
  issuer_nif: "B12345674",
  issuer_name: "Hotel Lumen S.L.",
  recipient: null,
  description: "Estancia AB12CD34",
  breakdown: [{ rate: 10, base: 233.91, tax: 23.39 }],
  corrects_id: null,
  replaces_ids: null,
};

async function recordFor(
  id: string,
  invoice: VfInvoice,
  prevHash: string | null,
  seq: number,
): Promise<VfRecord> {
  const r: VfRecord = {
    id,
    tenant_id: "t1",
    invoice_id: invoice.id,
    seq,
    kind: "alta",
    subsanacion: false,
    rechazo_previo: null,
    sin_registro_previo: false,
    issuer_nif: invoice.issuer_nif,
    invoice_number: invoice.number,
    issue_date: "27-09-2026",
    invoice_type: invoice.type,
    cuota_total: "23.39",
    importe_total: "257.30",
    prev_hash: prevHash,
    prev_issuer_nif: prevHash ? invoice.issuer_nif : null,
    prev_number: prevHash ? "PS2026-000000" : null,
    prev_issue_date: prevHash ? "26-09-2026" : null,
    generated_at: "2026-09-27T19:20:30+02:00",
    hash: "",
    environment: "simulated",
    attempts: 0,
  };
  r.hash = await huella({
    IDEmisorFactura: r.issuer_nif,
    NumSerieFactura: r.invoice_number,
    FechaExpedicionFactura: r.issue_date,
    TipoFactura: r.invoice_type!,
    CuotaTotal: r.cuota_total!,
    ImporteTotal: r.importe_total!,
    Huella: r.prev_hash ?? "",
    FechaHoraHusoGenRegistro: r.generated_at,
  });
  return r;
}

function fakeStore(records: VfRecord[], invoices: VfInvoice[], nextSendAt: string | null = null) {
  const patches: Record<string, RecordPatch> = {};
  const flow: { wait?: number; next?: string } = {};
  const store: VerifactuStore = {
    async settings() {
      return { tenant_id: "t1", installation_number: "20260927-1", next_send_at: nextSendAt };
    },
    async pending() {
      return records.filter((r) => !patches[r.id]?.status || patches[r.id].status === "pending");
    },
    async invoices(ids) {
      return invoices.filter((i) => ids.includes(i.id));
    },
    async certificate() {
      return null;
    },
    async updateRecord(id, patch) {
      patches[id] = { ...patches[id], ...patch };
    },
    async setFlow(_t, wait, next) {
      flow.wait = wait;
      flow.next = next;
    },
  };
  return { store, patches, flow };
}
const sif = {
  producerName: "Test",
  producerNif: "B00000000",
  name: "Melend/OS",
  id: "MO",
  version: "1.0.0",
};
const now = new Date("2026-09-27T17:30:00Z");

describe("dispatchTenant", () => {
  it("sends in chain order, one record per invoice, and keeps the CSV and the wait", async () => {
    const inv2 = { ...INVOICE, id: "inv-2", number: "PS2026-000002" };
    const a = await recordFor("r1", INVOICE, null, 1);
    const b = await recordFor("r2", inv2, a.hash, 2);
    const again = { ...(await recordFor("r3", INVOICE, b.hash, 3)), subsanacion: true };
    const { store, patches, flow } = fakeStore([a, b, again], [INVOICE, inv2]);
    const report = await dispatchTenant(store, () => simulatedTransport(), sif, "t1", now);
    expect(report).toMatchObject({ sent: 2, accepted: 2, rejected: 0 });
    expect(patches.r1).toMatchObject({ status: "accepted", attempts: 1 });
    expect(patches.r1.csv).toHaveLength(16);
    expect(patches.r3).toBeUndefined(); // same invoice as r1: next send
    expect(flow).toEqual({ wait: 60, next: "2026-09-27T17:31:00.000Z" });
  });

  it("waits while the AEAT's waiting time lasts", async () => {
    const a = await recordFor("r1", INVOICE, null, 1);
    const { store, patches } = fakeStore([a], [INVOICE], "2026-09-27T17:30:30Z");
    expect(await dispatchTenant(store, () => simulatedTransport(), sif, "t1", now)).toMatchObject({
      waiting: true,
      sent: 0,
    });
    expect(patches).toEqual({});
  });

  it("keeps records pending on a fault and records the AEAT's refusals", async () => {
    const a = await recordFor("r1", INVOICE, null, 1);
    const down = fakeStore([a], [INVOICE]);
    const fault: VerifactuTransport = {
      async send() {
        return {
          fault: "Codigo[4104].El NIF del titular no está identificado",
          csv: null,
          wait: null,
          state: null,
          lines: [],
        };
      },
    };
    expect(await dispatchTenant(down.store, () => fault, sif, "t1", now)).toMatchObject({
      failed: 1,
    });
    expect(down.patches.r1).toMatchObject({
      attempts: 1,
      error: "AEAT: Codigo[4104].El NIF del titular no está identificado",
    });
    expect(down.patches.r1.status).toBeUndefined();

    const refused = fakeStore([a], [INVOICE]);
    const no: VerifactuTransport = {
      async send() {
        return {
          fault: null,
          csv: null,
          wait: 120,
          state: "Incorrecto",
          lines: [
            {
              ref: "r1",
              number: INVOICE.number,
              operation: "Alta",
              state: "Incorrecto",
              code: "1100",
              description: "Valor no permitido",
              duplicateState: null,
            },
          ],
        };
      },
    };
    expect(await dispatchTenant(refused.store, () => no, sif, "t1", now)).toMatchObject({
      rejected: 1,
    });
    expect(refused.patches.r1).toMatchObject({
      status: "rejected",
      error_code: "1100",
      error: "Valor no permitido",
    });
    expect(refused.flow.wait).toBe(120);
  });
});

describe("tax ids", () => {
  it("accepts valid NIF, NIE and CIF and refuses a wrong control", () => {
    expect(validSpanishTaxId("12345678Z")).toBe(true);
    expect(validSpanishTaxId("X1234567L")).toBe(true);
    expect(validCif("B12345674")).toBe(true);
    expect(validSpanishTaxId("12345678A")).toBe(false);
    expect(validCif("B12345670")).toBe(false);
  });
});
