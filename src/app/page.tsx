const swatches: Array<{ name: string; className: string }> = [
  { name: "Avellana", className: "bg-copper" },
  { name: "Chocolate", className: "bg-cocoa" },
  { name: "Ok", className: "bg-ok" },
  { name: "Atención", className: "bg-warn" },
  { name: "Crítico", className: "bg-bad" },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 bg-bg px-6 py-24 text-ink">
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-copper">
          Heladería · Producción
        </p>
        <h1 className="font-display text-5xl italic leading-none text-ink">
          Malaga Soft
        </h1>
        <p className="max-w-sm text-sm text-ink-soft">
          Scaffold en pie. Recetas, órdenes de producción, stock en vivo y
          planificación diaria llegan en las próximas fases.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {swatches.map((swatch) => (
          <div key={swatch.name} className="flex flex-col items-center gap-2">
            <div
              className={`h-10 w-10 rounded-md border border-border ${swatch.className}`}
            />
            <span className="text-[10.5px] font-medium text-ink-soft">
              {swatch.name}
            </span>
          </div>
        ))}
      </div>

      <p className="font-mono text-[11px] text-ink-soft">
        OP-2026-0114 · GD-0731 · 2,140 kg
      </p>
    </div>
  );
}
