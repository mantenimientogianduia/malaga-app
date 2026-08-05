import Link from "next/link";
import { notFound } from "next/navigation";
import { getProducto } from "@/lib/productos/queries";
import { getRecetaActivaPorProducto } from "@/lib/recetas/queries";
import { listOrdenesPorProducto } from "@/lib/ordenes/queries";
import { listStockPtVivo, listStockSemiVivo, listConsumoDiarioPorProducto } from "@/lib/stock/queries";
import { IconChevronLeft, IconPencil } from "@/components/icons";
import { formatFecha } from "@/lib/formatDate";
import { ProductoInfoForm } from "./ProductoInfoForm";

const ESTADO_LABEL: Record<string, string> = {
  planificada: "Planificada",
  en_proceso: "En proceso",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

export default async function ProductoDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const idProd = Number(id);
  const producto = await getProducto(idProd);
  if (!producto) notFound();

  const [receta, ordenes, stockPt, stockSemi, consumoDiario] = await Promise.all([
    getRecetaActivaPorProducto(idProd),
    listOrdenesPorProducto(idProd, 8),
    producto.tipoProducto === "PT" ? listStockPtVivo() : Promise.resolve([]),
    producto.tipoProducto === "SEMI" ? listStockSemiVivo() : Promise.resolve([]),
    producto.tipoProducto === "SEMI" ? listConsumoDiarioPorProducto(idProd, 14) : Promise.resolve([]),
  ]);

  const stockPtDelProducto = stockPt.filter((s) => s.idProd === idProd);
  const stockSemiDelProducto = stockSemi.filter((s) => s.idProd === idProd);
  const stockTotal =
    producto.tipoProducto === "PT"
      ? stockPtDelProducto.reduce((acc, s) => acc + Number(s.cantidad), 0)
      : stockSemiDelProducto.reduce((acc, s) => acc + Number(s.restante), 0);

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <Link
        href="/productos"
        className="mb-5 inline-flex items-center gap-1 text-xs font-medium text-ink-soft transition-colors hover:text-copper"
      >
        <IconChevronLeft /> Productos
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="page-eyebrow">{producto.tipoProducto === "PT" ? "Producto terminado" : "Semielaborado"}</span>
            {producto.codigo && <span className="font-mono text-xs text-ink-soft">{producto.codigo}</span>}
            {!producto.activo && (
              <span className="rounded-full bg-bad-tint px-2 py-0.5 text-[10px] font-semibold text-bad">
                Inactivo
              </span>
            )}
          </div>
          <h1 className="font-display text-3xl italic leading-none text-ink">{producto.detalle}</h1>
        </div>

        <div className="card px-4 py-3 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
            Stock en vivo
          </div>
          <div className="font-mono text-xl font-medium text-ink">
            {stockTotal.toFixed(3)} <span className="text-sm text-ink-soft">{producto.unidMed}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <IconPencil className="text-copper" /> Información
            </h2>
            <ProductoInfoForm producto={producto} />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">Receta activa</h2>
            {receta ? (
              <div className="card p-5">
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="font-mono text-xs text-ink-soft">v{receta.version}</span>
                  <Link
                    href={`/recetas/${producto.idProd}/editar`}
                    className="text-xs font-medium text-copper hover:text-copper-strong"
                  >
                    Editar receta
                  </Link>
                </div>
                <ul className="flex flex-col gap-1.5 text-sm text-ink">
                  {receta.items.map((item) => (
                    <li key={item.idSubprod} className="flex justify-between">
                      <span>{item.subprodDetalle}</span>
                      <span className="font-mono text-ink-soft">{item.cantSubprod}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="card flex flex-col items-start gap-3 p-5">
                <p className="text-sm text-ink-soft">Este producto todavía no tiene una receta.</p>
                <Link
                  href={`/recetas/${producto.idProd}/editar`}
                  className="text-xs font-medium text-copper hover:text-copper-strong"
                >
                  Crear receta
                </Link>
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-3">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">
              {producto.tipoProducto === "PT" ? "Stock vigente" : "Partidas con restante"}
            </h2>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-ink-soft">
                    <th className="px-4 py-3">Lote</th>
                    <th className="px-4 py-3 text-right">Cantidad</th>
                    {producto.tipoProducto === "PT" && <th className="px-4 py-3">Fecha fab.</th>}
                  </tr>
                </thead>
                <tbody>
                  {producto.tipoProducto === "PT"
                    ? stockPtDelProducto.map((s) => (
                        <tr key={s.idPartida} className="border-b border-border transition-colors last:border-0 hover:bg-surface-raised">
                          <td className="px-4 py-3 font-mono text-ink-soft">{s.lote}</td>
                          <td className="px-4 py-3 text-right font-mono text-ink">{s.cantidad}</td>
                          <td className="px-4 py-3 text-ink-soft">{formatFecha(s.fechaFab)}</td>
                        </tr>
                      ))
                    : stockSemiDelProducto.map((s) => (
                        <tr key={s.idPartida} className="border-b border-border transition-colors last:border-0 hover:bg-surface-raised">
                          <td className="px-4 py-3 font-mono text-ink-soft">{s.lote}</td>
                          <td className="px-4 py-3 text-right font-mono text-ink">{s.restante}</td>
                        </tr>
                      ))}
                  {stockPtDelProducto.length === 0 && stockSemiDelProducto.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-ink-soft">
                        Sin stock en vivo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">Últimas producciones</h2>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-ink-soft">
                    <th className="px-4 py-3">OP</th>
                    <th className="px-4 py-3 text-right">Real</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenes.map((o) => (
                    <tr key={o.idOp} className="border-b border-border transition-colors last:border-0 hover:bg-surface-raised">
                      <td className="px-4 py-3 font-mono text-ink-soft">OP-{o.idOp}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink">{o.cantReal ?? "—"}</td>
                      <td className="px-4 py-3 text-ink-soft">{formatFecha(o.fechaReal ?? o.fechaPlan)}</td>
                      <td className="px-4 py-3 text-ink-soft">{ESTADO_LABEL[o.estado]}</td>
                    </tr>
                  ))}
                  {ordenes.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-ink-soft">
                        Todavía no se produjo este producto.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {producto.tipoProducto === "SEMI" && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-ink">Consumo diario (últimos 14 días)</h2>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-ink-soft">
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3 text-right">Consumido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consumoDiario.map((c) => (
                      <tr key={c.fecha} className="border-b border-border transition-colors last:border-0 hover:bg-surface-raised">
                        <td className="px-4 py-3 text-ink-soft">{formatFecha(c.fecha)}</td>
                        <td className="px-4 py-3 text-right font-mono text-ink">{c.cantidad}</td>
                      </tr>
                    ))}
                    {consumoDiario.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-center text-ink-soft">
                          Sin consumo registrado en este período.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
