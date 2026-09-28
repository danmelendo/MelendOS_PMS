import { describe, expect, it } from "vitest";
import { csvDate, importedStatus, reservationsFromCsv } from "./reservations-csv.ts";

const HEAD =
  "Establecimiento;Habitación;Entrada;Salida;Huéspedes;Nombre;Email;Teléfono;Total;Pagado;Pago;Estado;Referencia;Notas\n";

describe("bookings from the previous system", () => {
  it("reads Spanish dates, amounts and payment", () => {
    const r = reservationsFromCsv(
      HEAD +
        "Hostal Ejemplo;2;15/10/2026;18/10/2026;2;Laura Gómez;Laura@Example.com;600 000 000;180,50;180,50;online;;BK-1;Cuna\n" +
        "Hostal Ejemplo;3;2026-11-02;2026-11-04;1;Pedro Ruiz;;;120;0;hotel;cancelada;;\n",
    );
    expect(r.problems).toEqual([]);
    expect(r.reservations[0]).toMatchObject({
      checkIn: "2026-10-15",
      checkOut: "2026-10-18",
      email: "laura@example.com",
      total: 180.5,
      paid: 180.5,
      paymentMode: "prepay",
      cancelled: false,
      reference: "BK-1",
      notes: "Cuna",
    });
    expect(r.reservations[1]).toMatchObject({
      paymentMode: "at_hotel",
      cancelled: true,
      email: null,
    });
  });

  it("says which row is wrong and why", () => {
    const r = reservationsFromCsv(
      HEAD +
        "Hostal;1;31/02/2026;01/03/2026;2;Ana;;;100;0;;;;\n" +
        "Hostal;1;05/03/2026;04/03/2026;0;;mal;;100;150;cheque;dudosa;;\n",
    );
    expect(r.problems).toEqual([
      "Fila 2: fecha de entrada no válida: «31/02/2026»",
      "Fila 3: la salida tiene que ser posterior a la entrada",
      "Fila 3: huéspedes tiene que ser un número de 1 a 12",
      "Fila 3: falta el nombre del huésped",
      "Fila 3: email no válido: «mal»",
      "Fila 3: pagado no válido (entre 0 y el total)",
      "Fila 3: forma de pago «cheque» desconocida (online o hotel)",
      "Fila 3: estado «dudosa» desconocido (confirmada o cancelada)",
    ]);
  });

  it("dates in the usual formats, and the status from today", () => {
    expect(csvDate("5/3/26")).toBe("2026-03-05");
    expect(csvDate("05.03.2026")).toBe("2026-03-05");
    expect(csvDate("2026-13-01")).toBeNull();
    const stay = { checkIn: "2026-10-01", checkOut: "2026-10-03", cancelled: false } as const;
    expect(importedStatus(stay, "2026-09-28")).toBe("confirmed");
    expect(importedStatus(stay, "2026-10-02")).toBe("in_progress");
    expect(importedStatus(stay, "2026-10-03")).toBe("completed");
    expect(importedStatus({ ...stay, cancelled: true }, "2026-09-28")).toBe("cancelled");
  });
});
