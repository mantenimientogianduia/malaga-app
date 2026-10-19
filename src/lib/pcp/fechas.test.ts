import { describe, it, expect } from "vitest";
import { fechaEnMalaga, sumarDias, mananaEnMalaga } from "./fechas";

describe("fechas en Málaga", () => {
  it("fechaEnMalaga usa la zona Europe/Madrid, no UTC", () => {
    // 22:30 UTC del 19/10 ya es 00:30 del 20/10 en Madrid (UTC+2 en octubre).
    expect(fechaEnMalaga(new Date("2026-10-19T22:30:00Z"))).toBe("2026-10-20");
    expect(fechaEnMalaga(new Date("2026-10-19T10:00:00Z"))).toBe("2026-10-19");
  });

  it("fechaEnMalaga respeta el horario de invierno (UTC+1)", () => {
    expect(fechaEnMalaga(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-02");
    expect(fechaEnMalaga(new Date("2026-12-01T22:30:00Z"))).toBe("2026-12-01");
  });

  it("sumarDias cruza fin de mes y de año", () => {
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("mananaEnMalaga es el día siguiente a la fecha de Málaga", () => {
    expect(mananaEnMalaga(new Date("2026-10-19T22:30:00Z"))).toBe("2026-10-21");
    expect(mananaEnMalaga(new Date("2026-10-19T10:00:00Z"))).toBe("2026-10-20");
  });
});
