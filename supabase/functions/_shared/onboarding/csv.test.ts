import { describe, expect, it } from "vitest";
import { roomsFromCsv } from "./csv.ts";

describe("rooms from a spreadsheet", () => {
  it("reads what a Spanish Excel exports", () => {
    const csv =
      "\uFEFFEstablecimiento;Habitación;Capacidad;Tipo;Tarifa;Precio;Precio fin de semana;Características\r\n" +
      "Hostal Ejemplo;1;1;habitación;Individual;45;55,50;wifi\r\n" +
      'Hostal Ejemplo;5;3;Familiar;Triple;"1.060,00";;"wifi, ac"\r\n' +
      "Hostal Ejemplo;2;2;;Individual;45;55,50;\r\n";
    const r = roomsFromCsv(csv);
    expect(r.problems).toEqual([]);
    expect(r.rates).toEqual([
      { name: "Individual", price: 45, weekend_price: 55.5 },
      { name: "Triple", price: 1060 },
    ]);
    expect(r.rooms[1]).toEqual({
      property: "Hostal Ejemplo",
      name: "5",
      capacity: 3,
      type: "family",
      rate: "Triple",
      features: ["wifi", "ac"],
    });
    expect(r.rooms[2].type).toBe("room");
  });

  it("accepts commas as separator too", () => {
    const r = roomsFromCsv(
      "establecimiento,habitacion,capacidad,tarifa,precio\nHotel,101,2,Doble,80.5\n",
    );
    expect(r.problems).toEqual([]);
    expect(r.rates).toEqual([{ name: "Doble", price: 80.5 }]);
  });

  it("says which row is wrong and why", () => {
    const r = roomsFromCsv(
      "establecimiento;habitación;capacidad;tipo;tarifa;precio\n" +
        "Hotel;101;0;habitación;Doble;80\n" +
        "Hotel;102;2;bungalow;Doble;80\n" +
        "Hotel;103;2;;Doble;90\n" +
        "Hotel;104;2;;Doble;abc\n",
    );
    expect(r.problems).toEqual([
      "Fila 2: la capacidad tiene que ser un número entero de 1 a 12",
      "Fila 3: tipo «bungalow» desconocido (habitación, suite o familiar)",
      "Fila 4: la tarifa «Doble» tiene otro precio en una fila anterior",
      "Fila 5: precio no válido",
    ]);
    expect(roomsFromCsv("habitación;precio\n1;2\n").problems).toEqual([
      "Falta la columna «establecimiento»",
      "Falta la columna «capacidad»",
      "Falta la columna «tarifa»",
    ]);
  });
});
