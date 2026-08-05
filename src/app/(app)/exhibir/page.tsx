import { listPartidasEnObrador, type PartidaEnObrador } from "@/lib/exhibidora/queries";
import { ExhibirGroup } from "./ExhibirGroup";

export default async function ExhibirPage() {
  const partidas = await listPartidasEnObrador();

  const grupos = new Map<number, { productoDetalle: string; partidas: PartidaEnObrador[] }>();
  for (const p of partidas) {
    if (!grupos.has(p.idProd)) {
      grupos.set(p.idProd, { productoDetalle: p.productoDetalle, partidas: [] });
    }
    grupos.get(p.idProd)!.partidas.push(p);
  }
  const gruposOrdenados = [...grupos.values()].sort((a, b) =>
    a.productoDetalle.localeCompare(b.productoDetalle)
  );

  return (
    <div className="p-10">
      <p className="page-eyebrow mb-1.5">Vitrina</p>
      <h1 className="mb-1 text-2xl font-semibold text-ink">Exhibir bachas</h1>
      <p className="mb-8 text-sm text-ink-soft">
        Producto y fecha de fabricación son lo primero que se mira en el obrador — por eso van grandes. Si hay
        más de una partida del mismo sabor, se recomienda siempre la más vieja primero.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {gruposOrdenados.map((g) => (
          <ExhibirGroup key={g.productoDetalle} productoDetalle={g.productoDetalle} partidas={g.partidas} />
        ))}
      </div>

      {gruposOrdenados.length === 0 && (
        <p className="card px-5 py-8 text-center text-sm text-ink-soft">
          No hay bachas esperando para exhibir en este momento.
        </p>
      )}
    </div>
  );
}
