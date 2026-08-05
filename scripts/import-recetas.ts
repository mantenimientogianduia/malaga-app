import { readFileSync } from "fs";
import path from "path";
import { query, withTransaction } from "../src/lib/db";

const CSV_PATH = path.join(__dirname, "..", "data", "imports", "productos-con-recetas.csv");

// Mismos códigos reutilizados que en el import histórico — para que "Base
// asociada" se aplique al producto correcto según el sabor de esa fila.
const RECODE: Record<string, string> = {
  "PT-HEL-101|Turrón": "PT-HEL-135",
  "PT-HEL-127|Raffaello": "PT-HEL-136",
};

// Nombres de "Base asociada" en este CSV que no coinciden textualmente con el
// nombre real ya cargado en d_productos (confirmado por eliminación: no hay
// otro candidato posible para ninguno de los dos).
const ALIAS_BASE: Record<string, string> = {
  "base banana toffee": "base banana",
  "base frangipane": "frangipane",
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

function normalizeBaseName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  return ALIAS_BASE[trimmed] ?? trimmed;
}

interface Row {
  codigo: string;
  nombre: string;
  pesoProm: number | null;
  baseAsociada: string | null;
  factor: number | null;
}

async function main() {
  const lines = readFileSync(CSV_PATH, "utf8").split(/\r?\n/).filter(Boolean);
  const rows: Row[] = lines.slice(1).map((line) => {
    const [codigoRaw, nombre, , , , pesoPromRaw, baseAsociadaRaw, factorRaw] = parseCsvLine(line);
    const codigo = RECODE[`${codigoRaw}|${nombre}`] ?? codigoRaw;
    const pesoProm = pesoPromRaw?.trim() ? Number(pesoPromRaw.replace(",", ".")) : null;
    const baseAsociada =
      baseAsociadaRaw?.trim() && baseAsociadaRaw.trim().toLowerCase() !== "no definida"
        ? baseAsociadaRaw.trim()
        : null;
    const factor = factorRaw?.trim() ? Number(factorRaw.replace(",", ".")) : null;
    return { codigo, nombre, pesoProm, baseAsociada, factor };
  });

  console.log(`${rows.length} filas leídas.`);

  const adminResult = await query<{ id_user: number }>(
    `SELECT id_user FROM malaga.usuarios WHERE rol = 'admin' ORDER BY id_user LIMIT 1`
  );
  if (adminResult.rows.length === 0) {
    throw new Error("No hay ningún usuario admin en la base para atribuir el alta de las recetas.");
  }
  const userAlta = adminResult.rows[0].id_user;

  const productosResult = await query<{ id_prod: number; codigo: string | null; detalle: string; tipo_producto: string }>(
    `SELECT id_prod, codigo, detalle, tipo_producto FROM malaga.d_productos`
  );
  const idPorCodigo = new Map<string, number>();
  const idPorDetalleNormalizado = new Map<string, number>();
  for (const p of productosResult.rows) {
    if (p.codigo) idPorCodigo.set(p.codigo, p.id_prod);
    idPorDetalleNormalizado.set(p.detalle.trim().toLowerCase(), p.id_prod);
  }

  await withTransaction(async (client) => {
    console.log("Actualizando peso_estandar con el promedio provisto (más autoritativo que la mediana calculada)...");
    let pesoActualizados = 0;
    for (const r of rows) {
      if (r.pesoProm === null) continue;
      const idProd = idPorCodigo.get(r.codigo);
      if (!idProd) continue;
      await client.query(`UPDATE malaga.d_productos SET peso_estandar = $2 WHERE id_prod = $1`, [
        idProd,
        r.pesoProm,
      ]);
      pesoActualizados++;
    }
    console.log(`peso_estandar actualizado en ${pesoActualizados} productos.`);

    console.log("Creando recetas...");
    let creadas = 0;
    const sinBase: string[] = [];
    const baseNoEncontrada: string[] = [];

    for (const r of rows) {
      if (!r.baseAsociada || r.factor === null) {
        if (r.codigo.startsWith("PT-")) sinBase.push(`${r.codigo} (${r.nombre})`);
        continue;
      }

      const idProdPadre = idPorCodigo.get(r.codigo);
      if (!idProdPadre) continue;

      const idSubprod = idPorDetalleNormalizado.get(normalizeBaseName(r.baseAsociada));
      if (!idSubprod) {
        baseNoEncontrada.push(`${r.codigo} (${r.nombre}) -> "${r.baseAsociada}"`);
        continue;
      }

      const pesoEstandarResult = await client.query<{ peso_estandar: string }>(
        `SELECT peso_estandar FROM malaga.d_productos WHERE id_prod = $1`,
        [idProdPadre]
      );
      const pesoEstandar = Number(pesoEstandarResult.rows[0].peso_estandar);
      const cantSubprod = Number((r.factor * pesoEstandar).toFixed(3));

      const recetaResult = await client.query<{ id_receta: number }>(
        `INSERT INTO malaga.recetas (id_prod, version, activa, user_alta)
         VALUES ($1, 1, true, $2) RETURNING id_receta`,
        [idProdPadre, userAlta]
      );
      const idReceta = recetaResult.rows[0].id_receta;

      await client.query(
        `INSERT INTO malaga.recetas_detalles (id_receta, id_prod_padre, id_subprod, cant_subprod)
         VALUES ($1, $2, $3, $4)`,
        [idReceta, idProdPadre, idSubprod, cantSubprod]
      );
      creadas++;
    }

    console.log(`${creadas} recetas creadas.`);
    if (sinBase.length > 0) {
      console.log(`Sin base asociada (sin receta, ej. "Novedad"): ${sinBase.join(", ")}`);
    }
    if (baseNoEncontrada.length > 0) {
      console.log(`ATENCIÓN — base referenciada que no matcheó ningún producto: ${baseNoEncontrada.join(" | ")}`);
    }
  });

  console.log("Importación de recetas completa.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
