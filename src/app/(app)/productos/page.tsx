import Link from "next/link";
import { listProductos } from "@/lib/productos/queries";

export default async function ProductosPage() {
  const productos = await listProductos();

  return (
    <div className="p-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="page-eyebrow mb-1.5">Catálogo</p>
          <h1 className="text-2xl font-semibold text-ink">Productos</h1>
        </div>
        <Link
          href="/productos/nuevo"
          className="rounded-lg bg-copper px-4 py-2 text-sm font-semibold text-white shadow-card transition-colors hover:bg-copper-strong"
        >
          Nuevo producto
        </Link>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Detalle</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Unidad</th>
              <th className="px-4 py-3 text-right">Peso estándar</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.idProd} className="group border-b border-border transition-colors last:border-0 hover:bg-surface-raised">
                <td className="px-4 py-3 font-mono text-ink-soft">{p.codigo ?? "—"}</td>
                <td className="px-4 py-3">
                  <Link
                    href={`/productos/${p.idProd}`}
                    className="font-medium text-ink transition-colors group-hover:text-copper-strong"
                  >
                    {p.detalle}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-soft">{p.tipoProducto}</td>
                <td className="px-4 py-3 text-ink-soft">{p.unidMed}</td>
                <td className="px-4 py-3 text-right font-mono text-ink-soft">
                  {p.pesoEstandar ? `${p.pesoEstandar} ${p.unidMed}` : "—"}
                </td>
                <td className="px-4 py-3 text-ink-soft">{p.activo ? "Activo" : "Inactivo"}</td>
              </tr>
            ))}
            {productos.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-soft">
                  Todavía no hay productos cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
