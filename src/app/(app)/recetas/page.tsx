import Link from "next/link";
import { listRecetasActivas } from "@/lib/recetas/queries";

export default async function RecetasPage() {
  const recetas = await listRecetasActivas();

  return (
    <div className="p-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="page-eyebrow mb-1.5">Fórmulas</p>
          <h1 className="text-2xl font-semibold text-ink">Recetas</h1>
        </div>
        <Link
          href="/recetas/nueva"
          className="rounded-lg bg-copper px-4 py-2 text-sm font-semibold text-white shadow-card transition-colors hover:bg-copper-strong"
        >
          Nueva receta
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {recetas.map((r) => (
          <div key={r.idReceta} className="card flex flex-col gap-3 p-5">
            <div className="flex items-baseline justify-between">
              <Link
                href={`/productos/${r.idProd}`}
                className="text-base font-semibold text-ink transition-colors hover:text-copper-strong"
              >
                {r.productoDetalle}
              </Link>
              <span className="font-mono text-xs text-ink-soft">v{r.version}</span>
            </div>
            <ul className="flex flex-col gap-1 text-sm text-ink-soft">
              {r.items.map((item) => (
                <li key={item.idSubprod} className="flex justify-between gap-2">
                  <span className="truncate">{item.subprodDetalle}</span>
                  <span className="font-mono text-ink">{item.cantSubprod}</span>
                </li>
              ))}
            </ul>
            <Link
              href={`/recetas/${r.idProd}/editar`}
              className="mt-1 self-start text-xs font-medium text-copper hover:text-copper-strong"
            >
              Editar receta
            </Link>
          </div>
        ))}
        {recetas.length === 0 && (
          <p className="text-sm text-ink-soft">Todavía no hay recetas cargadas.</p>
        )}
      </div>
    </div>
  );
}
