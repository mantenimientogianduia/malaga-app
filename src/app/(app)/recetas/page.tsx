import Link from "next/link";
import { listRecetasActivas } from "@/lib/recetas/queries";

export default async function RecetasPage() {
  const recetas = await listRecetasActivas();

  return (
    <div className="p-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Recetas</h1>
        <Link
          href="/recetas/nueva"
          className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white"
        >
          Nueva receta
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        {recetas.map((r) => (
          <div key={r.idReceta} className="rounded-lg border border-border bg-surface p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-ink">{r.productoDetalle}</h2>
              <span className="font-mono text-xs text-ink-soft">v{r.version}</span>
            </div>
            <ul className="flex flex-col gap-1 text-sm text-ink-soft">
              {r.items.map((item) => (
                <li key={item.idSubprod}>
                  {item.cantSubprod} × {item.subprodDetalle}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {recetas.length === 0 && (
          <p className="text-sm text-ink-soft">Todavía no hay recetas cargadas.</p>
        )}
      </div>
    </div>
  );
}
