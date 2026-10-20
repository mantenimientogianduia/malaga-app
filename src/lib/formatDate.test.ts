import { describe, expect, it } from "vitest";
import { formatFechaHora } from "./formatDate";

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
