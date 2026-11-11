import { describe, expect, it } from "vitest";
import { formatFechaHora, formatHora } from "./formatDate";

describe("formatFechaHora", () => {
  it("formatea en hora de Malaga en verano (UTC+2)", () => {
    expect(formatFechaHora("2026-10-19T22:30:00Z")).toBe("20/10 00:30");
  });

  it("formatea en hora de Malaga en invierno (UTC+1)", () => {
    expect(formatFechaHora("2026-12-01T23:30:00Z")).toBe("02/12 00:30");
  });

  it("devuelve un guion para null y undefined", () => {
    expect(formatFechaHora(null)).toBe("—");
    expect(formatFechaHora(undefined)).toBe("—");
  });

  it("devuelve el texto original si no es una fecha", () => {
    expect(formatFechaHora("no es fecha")).toBe("no es fecha");
  });
});

describe("formatHora", () => {
  it("formatea solo la hora en Malaga", () => {
    expect(formatHora("2026-10-19T22:30:00Z")).toBe("00:30");
    expect(formatHora("2026-12-01T09:05:00Z")).toBe("10:05");
  });

  it("devuelve un guion para null y el texto original si no es fecha", () => {
    expect(formatHora(null)).toBe("—");
    expect(formatHora("no es fecha")).toBe("no es fecha");
  });
});
