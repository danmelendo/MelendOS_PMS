// Sends a hotel's pending SES.HOSPEDAJES communications and collects the
// ministry's answers. Database triggers queue them (ses_communications):
// - RH "A" when a booking is confirmed, and again ("B" + "A") if its dates or
//   guests change after it was reported;
// - RH "B" when a reported booking is cancelled;
// - PV "A" at check-in.
// Each run first asks how the batches already sent went (the service works
// asynchronously), then sends what is due: data is read at send time, so a
// fix in the register is picked up by the next run. What is not complete is
// left "blocked" with the reasons, and retried every run.
import {
  travellerIssues,
  partyIssues,
  holderIssues,
  splitFullName,
  sesPaymentType,
  type SesTraveller,
} from "../domain/ses.ts";
import { ymdInZone } from "../domain/dates.ts";
import {
  buildAltaXml,
  buildCancelXml,
  buildQueryXml,
  localDateTime,
  type SesAddress,
  type SesCommunication,
  type SesKind,
  type SesPerson,
} from "./xml.ts";
import type { SesConfig, SesTransport } from "./transport.ts";

export const MAX_PER_BATCH = 100;
export const MAX_ATTEMPTS = 5;

export type SesStatus =
  | "pending"
  | "blocked"
  | "sent"
  | "accepted"
  | "rejected"
  | "error"
  | "skipped"
  | "cancelled";

export interface SesRow {
  id: string;
  tenant_id: string;
  reservation_id: string;
  kind: SesKind;
  operation: "A" | "B";
  status: SesStatus;
  batch: string | null;
  batch_order: number | null;
  ses_code: string | null;
  attempts: number;
  /** For a "B": the ministry code of the communication it cancels. */
  target_id: string | null;
  target_code?: string | null;
  target_status?: SesStatus | null;
}

export interface SesBookingData {
  reference: string;
  created_at: string;
  start_at: string;
  end_at: string;
  people: number;
  payment_mode: string;
  channel_id: string | null;
  timezone: string;
  establishment_code: string | null;
  customer: { name: string | null; phone: string | null; email: string | null } | null;
  travellers: SesTraveller[];
}

export type SesPatch = Partial<
  Pick<SesRow, "status" | "batch" | "batch_order" | "ses_code" | "attempts">
> & { error?: string | null; sent_at?: string; resolved_at?: string };

export interface SesStore {
  /** Rows sent and waiting for the ministry's answer. */
  awaiting(tenantId: string): Promise<SesRow[]>;
  /** Rows to send: pending, blocked, or failed fewer than MAX_ATTEMPTS times. */
  due(tenantId: string): Promise<SesRow[]>;
  bookingData(reservationId: string): Promise<SesBookingData | null>;
  update(ids: string[], patch: SesPatch): Promise<void>;
}

export interface DispatchReport {
  sent: number;
  accepted: number;
  rejected: number;
  blocked: number;
  errors: number;
}

const chunks = <T>(xs: T[], n: number) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

function toAddress(t: SesTraveller): SesAddress | null {
  if (!t.address || !t.country) return null;
  return {
    direccion: t.address,
    direccionComplementaria: t.address_extra,
    codigoMunicipio: t.municipality_code,
    nombreMunicipio: t.municipality_name,
    codigoPostal: t.postal_code ?? "",
    pais: t.country,
  };
}

function toPerson(t: SesTraveller, rol: "VI" | "TI"): SesPerson {
  return {
    rol,
    nombre: t.first_name ?? "",
    apellido1: t.last_name1 ?? "",
    apellido2: t.last_name2,
    tipoDocumento: t.document_type,
    numeroDocumento: t.document_number?.toUpperCase().replace(/[\s-]/g, ""),
    soporteDocumento: t.document_support?.toUpperCase().replace(/[\s-]/g, ""),
    fechaNacimiento: t.birth_date,
    nacionalidad: t.nationality,
    sexo: t.sex,
    direccion: toAddress(t),
    telefono: t.phone,
    telefono2: t.phone2,
    correo: t.email,
    parentesco: t.kinship,
  };
}

/** The communication of a booking, or the reasons it cannot be sent yet. */
export function buildCommunication(
  kind: SesKind,
  b: SesBookingData,
): { ok: true; comm: SesCommunication } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (!b.establishment_code) reasons.push("Falta el código de establecimiento del ministerio");
  const checkIn = ymdInZone(b.start_at, b.timezone);
  const contrato = {
    referencia: b.reference,
    fechaContrato: ymdInZone(b.created_at, b.timezone),
    fechaEntrada: localDateTime(b.start_at, b.timezone),
    fechaSalida: localDateTime(b.end_at, b.timezone),
    numPersonas: b.people,
    numHabitaciones: 1,
    pago: { tipoPago: sesPaymentType(b) },
  };

  let personas: SesPerson[];
  if (kind === "PV") {
    const { travellers, party } = partyIssues(b.travellers, checkIn, b.people);
    travellers.forEach((issues, i) =>
      issues.forEach((x) => reasons.push(`Viajero ${i + 1}: ${x.message}`)),
    );
    party.forEach((x) => reasons.push(x.message));
    personas = b.travellers.map((t) => toPerson(t, "VI"));
  } else {
    // The holder: from the register if reception has it, else the booking.
    const registered = b.travellers.find((t) => t.is_holder);
    const holder: SesTraveller = registered
      ? {
          ...registered,
          phone: registered.phone || b.customer?.phone,
          email: registered.email || b.customer?.email,
        }
      : { ...splitFullName(b.customer?.name), phone: b.customer?.phone, email: b.customer?.email };
    holderIssues(holder).forEach((x) => reasons.push(x.message));
    // Optional data of the holder is sent only if it is valid.
    const valid = registered && travellerIssues(holder, checkIn).length === 0;
    const base: SesTraveller = valid
      ? holder
      : {
          first_name: holder.first_name,
          last_name1: holder.last_name1,
          last_name2: holder.last_name2,
          phone: holder.phone,
          email: holder.email,
        };
    personas = [toPerson({ ...base, document_support: null, kinship: null }, "TI")];
  }
  if (reasons.length) return { ok: false, reasons };
  return { ok: true, comm: { establecimiento: b.establishment_code!, contrato, personas } };
}

const now = () => new Date().toISOString();

/** Asks the ministry how the batches already sent went. */
async function collect(store: SesStore, t: SesTransport, tenantId: string, r: DispatchReport) {
  const rows = await store.awaiting(tenantId);
  const byBatch = new Map<string, SesRow[]>();
  for (const row of rows)
    if (row.batch) byBatch.set(row.batch, [...(byBatch.get(row.batch) ?? []), row]);

  for (const batches of chunks([...byBatch.keys()], 10)) {
    const res = await t.call("C", undefined, buildQueryXml(batches));
    if (res.codigo !== 0) continue; // try again next run
    for (const result of res.resultados) {
      const members = byBatch.get(result.lote) ?? [];
      if (!members.length || result.codigoEstado === 4 || result.codigoEstado === 5) continue;
      if (result.codigoEstado === 2 || result.codigoEstado === 3) {
        const retry = result.codigoEstado === 3;
        await store.update(
          members.map((m) => m.id),
          {
            status: retry ? "error" : "rejected",
            error: result.descEstado ?? `Lote con estado ${result.codigoEstado}`,
            batch: null,
            batch_order: null,
          },
        );
        if (retry) r.errors += members.length;
        else r.rejected += members.length;
        continue;
      }
      for (const m of members) {
        if (m.operation === "B") {
          await store.update([m.id], { status: "accepted", error: null, resolved_at: now() });
          if (m.target_id) await store.update([m.target_id], { status: "cancelled" });
          r.accepted++;
          continue;
        }
        const c = result.comunicaciones.find((x) => x.orden === m.batch_order);
        if (c?.codigo) {
          await store.update([m.id], {
            status: "accepted",
            ses_code: c.codigo,
            error: null,
            resolved_at: now(),
          });
          r.accepted++;
        } else {
          await store.update([m.id], {
            status: "rejected",
            error: c
              ? [c.tipoError, c.error].filter(Boolean).join(": ")
              : "Sin resultado del ministerio",
            resolved_at: now(),
          });
          r.rejected++;
        }
      }
    }
  }
}

/** Sends everything due for one hotel. */
async function send(store: SesStore, t: SesTransport, tenantId: string, r: DispatchReport) {
  const rows = await store.due(tenantId);

  // A cancellation whose target never reached the ministry has nothing to do.
  const moot = rows.filter(
    (x) =>
      x.operation === "B" &&
      !x.target_code &&
      ["rejected", "skipped", "cancelled"].includes(x.target_status ?? ""),
  );
  if (moot.length)
    await store.update(
      moot.map((m) => m.id),
      { status: "skipped", error: null },
    );

  // Cancellations: one batch with the codes (their targets are already known).
  const cancels = rows.filter((x) => x.operation === "B" && x.target_code);
  for (const group of chunks(cancels, MAX_PER_BATCH)) {
    const res = await t
      .call("B", undefined, buildCancelXml(group.map((g) => g.target_code!)))
      .catch((e: Error) => ({ codigo: -1, descripcion: e.message, lote: null }));
    await markSent(store, group, res, r);
  }

  // New communications, built from the current data.
  const ready: Record<string, { row: SesRow; comm: SesCommunication }[]> = {};
  for (const row of rows.filter((x) => x.operation === "A")) {
    const data = await store.bookingData(row.reservation_id);
    if (!data) continue;
    const built = buildCommunication(row.kind, data);
    if (!built.ok) {
      await store.update([row.id], { status: "blocked", error: built.reasons.join(" · ") });
      r.blocked++;
      continue;
    }
    // Traveller reports go one establishment per file.
    const key = row.kind === "PV" ? `PV:${built.comm.establecimiento}` : "RH";
    (ready[key] ??= []).push({ row, comm: built.comm });
  }
  for (const [key, items] of Object.entries(ready)) {
    const kind = key.slice(0, 2) as SesKind;
    for (const group of chunks(items, MAX_PER_BATCH)) {
      const res = await t
        .call(
          "A",
          kind,
          buildAltaXml(
            kind,
            group.map((g) => g.comm),
          ),
        )
        .catch((e: Error) => ({ codigo: -1, descripcion: e.message, lote: null }));
      await markSent(
        store,
        group.map((g) => g.row),
        res,
        r,
      );
    }
  }
}

async function markSent(
  store: SesStore,
  group: SesRow[],
  res: { codigo: number; descripcion: string; lote: string | null },
  r: DispatchReport,
) {
  if (res.codigo === 0 && res.lote) {
    for (const [i, row] of group.entries())
      await store.update([row.id], {
        status: "sent",
        batch: res.lote,
        batch_order: i + 1,
        error: null,
        sent_at: now(),
        attempts: row.attempts + 1,
      });
    r.sent += group.length;
  } else {
    for (const row of group)
      await store.update([row.id], {
        status: "error",
        error: `${res.codigo > 0 ? res.codigo + " · " : ""}${res.descripcion}`,
        attempts: row.attempts + 1,
      });
    r.errors += group.length;
  }
}

/** One run for a hotel: collect answers, then send what is due. */
export async function dispatchTenant(
  store: SesStore,
  transport: SesTransport,
  tenantId: string,
): Promise<DispatchReport> {
  const report: DispatchReport = { sent: 0, accepted: 0, rejected: 0, blocked: 0, errors: 0 };
  await collect(store, transport, tenantId, report);
  await send(store, transport, tenantId, report);
  return report;
}

export type { SesConfig };
