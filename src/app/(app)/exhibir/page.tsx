import {
  listCartillaActual,
  listPartidasEnObrador,
  type PartidaEnObrador,
} from "@/lib/exhibidora/queries";
import { ExhibirSlot } from "./ExhibirSlot";
import { ExhibirGroup } from "./ExhibirGroup";

export default async function ExhibirPage() {
  const [slots, partidas] = await Promise.all([listCartillaActual(), listPartidasEnObrador()]);

  const partidasPorSlot = new Map<number, PartidaEnObrador[]>();
  const sinAsignar: PartidaEnObrador[] = [];
  for (const p of partidas) {
    if (p.idExhibidoraDestino) {
      const arr = partidasPorSlot.get(p.idExhibidoraDestino) ?? [];
      arr.push(p);
      partidasPorSlot.set(p.idExhibidoraDestino, arr);
    } else {
      sinAsignar.push(p);
    }
  }

  const gruposSinAsignar = new Map<number, { productoDetalle: string; partidas: PartidaEnObrador[] }>();
  for (const p of sinAsignar) {
    if (!gruposSinAsignar.has(p.idProd)) {
      gruposSinAsignar.set(p.idProd, { productoDetalle: p.productoDetalle, partidas: [] });
    }
    gruposSinAsignar.get(p.idProd)!.partidas.push(p);
  }
  const gruposSinAsignarOrdenados = [...gruposSinAsignar.values()].sort((a, b) =>
    a.productoDetalle.localeCompare(b.productoDetalle)
  );

  return (
    <div className="p-6 sm:p-8 lg:p-10">
      <p className="page-eyebrow mb-1">Vitrina</p>
      <h1 className="mb-1 text-xl font-semibold text-ink">Exhibir bachas</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Todas las posiciones de la exhibidora, tengan o no bachas esperando. Producto y fecha de fabricación
        son lo primero que se mira en el obrador — por eso van grandes. Si hay más de una partida del mismo
        sabor, se recomienda siempre la más vieja primero.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {slots.map((slot) => (
          <ExhibirSlot
            key={slot.idExhibidora}
            slot={slot}
            partidas={partidasPorSlot.get(slot.idExhibidora) ?? []}
          />
        ))}
      </div>

      {gruposSinAsignarOrdenados.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-warn">
            Bachas sin posición asignada — el sabor no coincide con ninguna posición actual de la cartilla
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {gruposSinAsignarOrdenados.map((g) => (
              <ExhibirGroup key={g.productoDetalle} productoDetalle={g.productoDetalle} partidas={g.partidas} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
