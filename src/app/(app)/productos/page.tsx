import Link from "next/link";
import { listProductos } from "@/lib/productos/queries";

export default async function ProductosPage() {
  const productos = await listProductos();

  return (
    <div className="p-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Productos</h1>
        <Link
          href="/productos/nuevo"
          className="rounded-md bg-copper px-4 py-2 text-sm font-semibold text-white"
        >
          Nuevo producto
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3">Detalle</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Unidad</th>
              <th className="px-4 py-3 text-right">Peso estándar</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.idProd} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{p.detalle}</td>
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
                <td colSpan={5} className="px-4 py-8 text-center text-ink-soft">
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
