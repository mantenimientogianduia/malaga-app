import { readFileSync, createReadStream } from "fs";
import { createInterface } from "readline";
import path from "path";
import { withTransaction } from "../src/lib/db";

const PRODUCTOS_CSV = path.join(__dirname, "..", "data", "imports", "productos.csv");
const LOTES_CSV = path.join(__dirname, "..", "data", "imports", "lotes.csv");

// Códigos reutilizados históricamente para dos sabores distintos: se separan
// en códigos nuevos para no perder ninguno de los dos historiales.
const RECODE: Record<string, string> = {
  "PT-HEL-101|Turrón": "PT-HEL-135",
  "PT-HEL-127|Raffaello": "PT-HEL-136",
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else cur += c;
  }
  result.push(cur);
  return result;
}

function parseFechaDDMMYYYY(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseFechaHoraDDMMYYYY(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, d, mo, y, h, mi, se] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${mi}:${se}`;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface ProductoCsvRow {
  codigo: string;
  nombre: string;
  familia: string;
  sector: string;
  posicion: string | null;
}

interface LoteParsed {
  codigo: string;
  fechaFab: string;
  peso: number;
  tsIngreso: string;
  tsExhibicion: string | null;
  ajuste: boolean;
}

async function main() {
  console.log("Leyendo productos.csv...");
  const prodLines = readFileSync(PRODUCTOS_CSV, "utf8").split(/\r?\n/).filter(Boolean);
  const prodRows: ProductoCsvRow[] = prodLines.slice(1).map((line) => {
    const [codigo, nombre, familia, sector, posicion] = parseCsvLine(line);
    const finalCodigo = RECODE[`${codigo}|${nombre}`] ?? codigo;
    return { codigo: finalCodigo, nombre, familia, sector, posicion: posicion?.trim() || null };
  });
  console.log(`${prodRows.length} productos leídos (códigos duplicados ya separados).`);

  console.log("Leyendo lotes.csv...");
  const pesosPorCodigo = new Map<string, number[]>();
  const lotes: LoteParsed[] = [];
  let naSkipped = 0;
  let malformedSkipped = 0;
  let zeroWeightSkipped = 0;
  let ajusteCount = 0;

  await new Promise<void>((resolve, reject) => {
    const rl = createInterface({ input: createReadStream(LOTES_CSV, "utf8") });
    let isHeader = true;
    rl.on("line", (line) => {
      if (isHeader) {
        isHeader = false;
        return;
      }
      if (!line.trim()) return;
      const cols = parseCsvLine(line);
      if (cols.length !== 7) {
        malformedSkipped++;
        return;
      }
      const [idProdRaw, fechaFabRaw, sabor, pesoRaw, marcaTemporalRaw, momentoExhibidoRaw, ajusteRaw] = cols;

      if (idProdRaw === "#N/A" || !idProdRaw.trim()) {
        naSkipped++;
        return;
      }

      const codigo = RECODE[`${idProdRaw}|${sabor}`] ?? idProdRaw;
      const fechaFab = parseFechaDDMMYYYY(fechaFabRaw);
      const peso = Number(pesoRaw.replace(",", "."));
      if (!fechaFab || Number.isNaN(peso)) {
        malformedSkipped++;
        return;
      }
      // peso 0 = casi siempre una fila de "Ajuste negativo" que anula/corrige (no una
      // partida real); f_partidas_stock exige cantidad > 0, así que se descartan.
      if (peso <= 0) {
        zeroWeightSkipped++;
        return;
      }

      const tsIngreso = parseFechaHoraDDMMYYYY(marcaTemporalRaw) ?? `${fechaFab}T00:00:00`;
      const tsExhibicion = parseFechaHoraDDMMYYYY(momentoExhibidoRaw ?? "");
      const ajuste = (ajusteRaw ?? "").trim() === "Si";
      if (ajuste) ajusteCount++;

      if (!pesosPorCodigo.has(codigo)) pesosPorCodigo.set(codigo, []);
      pesosPorCodigo.get(codigo)!.push(peso);

      lotes.push({ codigo, fechaFab, peso, tsIngreso, tsExhibicion, ajuste });
    });
    rl.on("close", resolve);
    rl.on("error", reject);
  });

  console.log(
    `${lotes.length} lotes válidos. Descartados: ${naSkipped} (#N/A), ${malformedSkipped} (mal formados), ` +
      `${zeroWeightSkipped} (peso 0 — casi todos "Ajuste negativo" que anulan, no partidas reales). ` +
      `${ajusteCount} marcados "Ajuste negativo" con peso > 0 (se importan igual, sin distinción).`
  );

  const allWeights = [...pesosPorCodigo.values()].flat();
  const globalMedian = median(allWeights);
  console.log(`Mediana global de pesos (fallback para PT sin historial): ${globalMedian.toFixed(3)} kg`);

  await withTransaction(async (client) => {
    console.log("Limpiando datos de prueba (productos, recetas, OP, partidas, exhibidora)...");
    await client.query(
      `TRUNCATE malaga.f_trazabilidad_op, malaga.f_partidas_stock, malaga.f_ordenes_produccion,
                malaga.recetas_detalles, malaga.recetas, malaga.d_exhibidora, malaga.d_productos
       RESTART IDENTITY CASCADE`
    );

    console.log("Insertando productos...");
    const idPorCodigo = new Map<string, number>();
    const fallbackUsados: string[] = [];
    for (const p of prodRows) {
      const tipoProducto = p.codigo.startsWith("PT-") ? "PT" : "SEMI";
      let pesoEstandar: number | null = null;
      if (tipoProducto === "PT") {
        const pesos = pesosPorCodigo.get(p.codigo);
        if (pesos && pesos.length > 0) {
          pesoEstandar = median(pesos);
        } else {
          pesoEstandar = globalMedian;
          fallbackUsados.push(`${p.codigo} (${p.nombre})`);
        }
      }

      const result = await client.query<{ id_prod: number }>(
        `INSERT INTO malaga.d_productos (codigo, detalle, sector, familia, unid_med, tipo_producto, peso_estandar)
         VALUES ($1, $2, $3, $4, 'kg', $5, $6)
         RETURNING id_prod`,
        [p.codigo, p.nombre, p.sector || null, p.familia || null, tipoProducto, pesoEstandar]
      );
      idPorCodigo.set(p.codigo, result.rows[0].id_prod);
    }
    console.log(`${idPorCodigo.size} productos insertados.`);
    if (fallbackUsados.length > 0) {
      console.log(`Productos PT sin lotes históricos (peso_estandar = mediana global): ${fallbackUsados.join(", ")}`);
    }

    console.log("Insertando posiciones de exhibidora...");
    const idExhibidoraPorCodigo = new Map<string, number>();
    let exhibidoraCount = 0;
    for (const p of prodRows) {
      if (!p.posicion) continue;
      const idProd = idPorCodigo.get(p.codigo);
      const nro = Number(p.posicion);
      if (!idProd || Number.isNaN(nro)) continue;
      const result = await client.query<{ id_exhibidora: number }>(
        `INSERT INTO malaga.d_exhibidora (nro, id_prod) VALUES ($1, $2) RETURNING id_exhibidora`,
        [nro, idProd]
      );
      idExhibidoraPorCodigo.set(p.codigo, result.rows[0].id_exhibidora);
      exhibidoraCount++;
    }
    console.log(`${exhibidoraCount} posiciones de exhibidora insertadas.`);

    console.log("Insertando partidas de stock...");
    const loteSeq = new Map<string, number>();
    const BATCH_SIZE = 500;
    let inserted = 0;
    let skippedNoProducto = 0;

    for (let i = 0; i < lotes.length; i += BATCH_SIZE) {
      const batch = lotes.slice(i, i + BATCH_SIZE);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let paramIdx = 1;

      for (const lote of batch) {
        const idProd = idPorCodigo.get(lote.codigo);
        if (!idProd) {
          skippedNoProducto++;
          continue;
        }

        const seqKey = `${lote.codigo}-${lote.fechaFab}`;
        const seq = (loteSeq.get(seqKey) ?? 0) + 1;
        loteSeq.set(seqKey, seq);
        const loteCodigo = `${lote.codigo}-${lote.fechaFab.replace(/-/g, "")}-${String(seq).padStart(2, "0")}`;

        const idExhibidora = lote.tsExhibicion ? idExhibidoraPorCodigo.get(lote.codigo) ?? null : null;

        placeholders.push(
          `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
        );
        values.push(idProd, lote.peso, lote.fechaFab, loteCodigo, lote.tsIngreso, lote.tsExhibicion, idExhibidora);
      }

      if (placeholders.length === 0) continue;

      await client.query(
        `INSERT INTO malaga.f_partidas_stock (id_prod, cantidad, fecha_fab, lote, ts_ingreso, ts_exhibicion, id_exhibidora)
         VALUES ${placeholders.join(", ")}`,
        values
      );
      inserted += placeholders.length;
      console.log(`  ${inserted} / ${lotes.length} partidas insertadas...`);
    }

    console.log(`Total partidas insertadas: ${inserted}. Sin producto correspondiente (omitidas): ${skippedNoProducto}`);
  });

  console.log("Importación completa.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
