export function BarDistribution({ items }: { items: { label: string; pct: number }[] }) {
  const max = Math.max(...items.map((i) => i.pct), 0.0001);

  return (
    <div className="card flex flex-col gap-1.5 p-4">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="w-28 flex-none truncate text-xs text-ink-soft">{item.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
            <div className="h-full rounded-full bg-copper" style={{ width: `${(item.pct / max) * 100}%` }} />
          </div>
          <span className="w-12 flex-none text-right font-mono text-[10.5px] text-ink-soft">
            {(item.pct * 100).toFixed(1)}%
          </span>
        </div>
      ))}
      {items.length === 0 && <p className="py-4 text-center text-sm text-ink-soft">Sin datos todavía.</p>}
    </div>
  );
}
