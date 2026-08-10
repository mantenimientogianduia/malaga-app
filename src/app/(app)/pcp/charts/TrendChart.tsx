import type { TendenciaSemanal } from "@/lib/pcp/stats";
import { formatFecha } from "@/lib/formatDate";

export function TrendChart({
  puntos,
  proyeccion,
}: {
  puntos: TendenciaSemanal[];
  proyeccion: number;
}) {
  if (puntos.length === 0) {
    return <p className="card py-8 text-center text-sm text-ink-soft">Todavía no hay suficiente historial.</p>;
  }

  const valores = [...puntos.map((p) => p.total), proyeccion];
  const max = Math.max(...valores, 1);
  const width = 640;
  const height = 180;
  const paddingX = 24;
  const paddingY = 16;
  const step = (width - paddingX * 2) / valores.length;

  const puntosSvg = valores.map((v, i) => {
    const x = paddingX + i * step;
    const y = height - paddingY - (v / max) * (height - paddingY * 2);
    return { x, y };
  });

  const path = puntosSvg.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const ultimoReal = puntosSvg[puntosSvg.length - 2];
  const proyectado = puntosSvg[puntosSvg.length - 1];

  return (
    <div className="card p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Tendencia semanal de demanda">
        <path d={path} fill="none" stroke="var(--copper)" strokeWidth={2} />
        {puntosSvg.slice(0, -1).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--copper)" />
        ))}
        {ultimoReal && proyectado && (
          <line
            x1={ultimoReal.x}
            y1={ultimoReal.y}
            x2={proyectado.x}
            y2={proyectado.y}
            stroke="var(--warn)"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        )}
        {proyectado && <circle cx={proyectado.x} cy={proyectado.y} r={4} fill="var(--warn)" />}
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-ink-soft">
        <span>{formatFecha(puntos[0]?.semana)}</span>
        <span className="font-medium text-warn">Proyección: {proyeccion.toFixed(1)}kg</span>
      </div>
    </div>
  );
}
