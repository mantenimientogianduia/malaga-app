// src/lib/pcp/weather.test.ts
import { describe, it, expect } from "vitest";
import { parsePronosticoOpenMeteo } from "./weather";

describe("parsePronosticoOpenMeteo", () => {
  it("mapea la respuesta diaria de Open-Meteo a un arreglo simple", () => {
    const respuesta = {
      daily: {
        time: ["2026-08-06", "2026-08-07"],
        temperature_2m_max: [31.2, 29.8],
        temperature_2m_min: [22.1, 21.5],
        precipitation_probability_max: [5, 40],
        weather_code: [1, 61],
      },
    };

    const dias = parsePronosticoOpenMeteo(respuesta);
    expect(dias).toEqual([
      { fecha: "2026-08-06", tempMax: 31.2, tempMin: 22.1, probabilidadLluvia: 5, condicion: "Mayormente despejado" },
      { fecha: "2026-08-07", tempMax: 29.8, tempMin: 21.5, probabilidadLluvia: 40, condicion: "Lluvia ligera" },
    ]);
  });

  it("con un weather_code desconocido, devuelve un texto genérico", () => {
    const respuesta = {
      daily: {
        time: ["2026-08-06"],
        temperature_2m_max: [30],
        temperature_2m_min: [20],
        precipitation_probability_max: [0],
        weather_code: [9999],
      },
    };
    expect(parsePronosticoOpenMeteo(respuesta)[0].condicion).toBe("—");
  });
});
