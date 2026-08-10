// src/lib/pcp/weather.ts

// Málaga centro.
const LATITUD = 36.7213;
const LONGITUD = -4.4214;

const CONDICION_POR_CODIGO: Record<number, string> = {
  0: "Despejado",
  1: "Mayormente despejado",
  2: "Parcialmente nublado",
  3: "Nublado",
  45: "Niebla",
  48: "Niebla con escarcha",
  51: "Llovizna ligera",
  53: "Llovizna",
  55: "Llovizna intensa",
  61: "Lluvia ligera",
  63: "Lluvia",
  65: "Lluvia intensa",
  71: "Nieve ligera",
  73: "Nieve",
  75: "Nieve intensa",
  80: "Chubascos ligeros",
  81: "Chubascos",
  82: "Chubascos intensos",
  95: "Tormenta",
};

export interface DiaClima {
  fecha: string;
  tempMax: number;
  tempMin: number;
  probabilidadLluvia: number;
  condicion: string;
}

interface RespuestaOpenMeteo {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    weather_code: number[];
  };
}

export function parsePronosticoOpenMeteo(respuesta: RespuestaOpenMeteo): DiaClima[] {
  return respuesta.daily.time.map((fecha, i) => ({
    fecha,
    tempMax: respuesta.daily.temperature_2m_max[i],
    tempMin: respuesta.daily.temperature_2m_min[i],
    probabilidadLluvia: respuesta.daily.precipitation_probability_max[i],
    condicion: CONDICION_POR_CODIGO[respuesta.daily.weather_code[i]] ?? "—",
  }));
}

export async function getPronosticoClima(): Promise<DiaClima[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LATITUD}&longitude=${LONGITUD}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
    `&timezone=Europe%2FMadrid&forecast_days=7`;

  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = (await res.json()) as RespuestaOpenMeteo;
    return parsePronosticoOpenMeteo(data);
  } catch {
    return [];
  }
}
