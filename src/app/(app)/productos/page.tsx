import Link from "next/link";
import { listProductos, type Producto } from "@/lib/productos/queries";
import { IconTarget, IconBox, IconFlask } from "@/components/icons";

function ProductoRow({ p, showSlot }: { p: Producto; showSlot: boolean }) {
  return (
    <tr className="group border-b border-border transition-colors last:border-0 hover:bg-surface-raised">
      {showSlot && (
        <td className="w-14 px-3.5 py-2.5">
          {p.posicionExhibidora ? (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-copper-tint font-mono text-[10px] font-semibold text-copper-strong">
              {p.posicionExhibidora}
            </span>
          ) : (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-border text-[10px] text-ink-soft">
              —
            </span>
          )}
        </td>
      )}
      <td className="px-3.5 py-2.5 font-mono text-ink-soft">{p.codigo ?? "—"}</td>
      <td className="px-3.5 py-2.5">
        <Link
          href={`/productos/${p.idProd}`}
          className="font-medium text-ink transition-colors group-hover:text-copper-strong"
        >
          {p.detalle}
        </Link>
      </td>
      <td className="px-3.5 py-2.5 text-ink-soft">{p.unidMed}</td>
      <td className="px-3.5 py-2.5 text-right font-mono text-ink-soft">
        {p.pesoEstandar ? `${p.pesoEstandar} ${p.unidMed}` : "—"}
      </td>
      <td className="px-3.5 py-2.5">
        {p.activo ? (
          <span className="text-ink-soft">Activo</span>
        ) : (
          <span className="rounded-full bg-bad-tint px-2 py-0.5 text-[10px] font-semibold text-bad">
            Inactivo
          </span>
        )}
      </td>
    </tr>
  );
}

function GroupTable({
  icon,
  eyebrow,
  title,
  hint,
  productos,
  showSlot,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  hint: string;
  productos: Producto[];
  showSlot: boolean;
}) {
  return (
    <section className="mb-6">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-copper-tint text-copper-strong">
          {icon}
        </span>
        <div>
          <p className="page-eyebrow leading-none">{eyebrow}</p>
          <h2 className="text-sm font-semibold text-ink">
            {title} <span className="font-mono text-xs font-normal text-ink-soft">· {productos.length}</span>
          </h2>
        </div>
        <span className="ml-auto hidden text-xs text-ink-soft sm:block">{hint}</span>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-ink-soft">
              {showSlot && <th className="px-3.5 py-2.5">Slot</th>}
              <th className="px-3.5 py-2.5">Código</th>
              <th className="px-3.5 py-2.5">Detalle</th>
              <th className="px-3.5 py-2.5">Unidad</th>
              <th className="px-3.5 py-2.5 text-right">Peso estándar</th>
              <th className="px-3.5 py-2.5">Estado</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((p) => (
              <ProductoRow key={p.idProd} p={p} showSlot={showSlot} />
            ))}
            {productos.length === 0 && (
              <tr>
                <td colSpan={showSlot ? 6 : 5} className="px-3.5 py-6 text-center text-ink-soft">
                  Nada acá todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function ProductosPage() {
  const productos = await listProductos();

  const enCartilla = productos
    .filter((p) => p.tipoProducto === "PT" && p.posicionExhibidora !== null)
    .sort((a, b) => (a.posicionExhibidora ?? 0) - (b.posicionExhibidora ?? 0));
  const fueraDeCartilla = productos.filter((p) => p.tipoProducto === "PT" && p.posicionExhibidora === null);
  const bases = productos.filter((p) => p.tipoProducto === "SEMI");

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="page-eyebrow mb-1">Catálogo</p>
          <h1 className="text-xl font-semibold text-ink">Productos</h1>
        </div>
        <Link
          href="/productos/nuevo"
          className="rounded-lg bg-copper px-3.5 py-1.5 text-xs font-semibold text-white shadow-card transition-colors hover:bg-copper-strong"
        >
          Nuevo producto
        </Link>
      </div>

      <GroupTable
        icon={<IconTarget />}
        eyebrow="En vitrina"
        title="Cartilla actual"
        hint="ordenado por posición en la exhibidora"
        productos={enCartilla}
        showSlot
      />

      <GroupTable
        icon={<IconBox />}
        eyebrow="Producto terminado"
        title="Fuera de cartilla"
        hint="sin posición asignada hoy"
        productos={fueraDeCartilla}
        showSlot={false}
      />

      <GroupTable
        icon={<IconFlask />}
        eyebrow="Semielaborados"
        title="Bases"
        hint="insumos de las recetas"
        productos={bases}
        showSlot={false}
      />
    </div>
  );
}
